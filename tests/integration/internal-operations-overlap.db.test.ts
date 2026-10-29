import { afterAll, describe, expect, it } from "vitest";

import {
  cleanupFixture,
  createAdminClient,
  createTestUser,
  requireDbConfig,
  testUrl,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import {
  openLocalSqlSession,
  sqlUuidLiteral,
  type LocalSqlSession,
} from "../helpers/local-postgres";

requireDbConfig();

const reason = "integration overlap operator change";

// Deadline for an observed lock wait: 100 polls of 100 ms (about 10 s). The
// wait ends on the server's pg_blocking_pids state, never on a fixed sleep.
async function waitUntilBlockedBy(
  control: LocalSqlSession,
  waitingPid: number,
  blockerPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const blockers = await control.query(
      `SELECT pg_blocking_pids(${waitingPid});`,
    );
    const pids = blockers.replace(/[{}]/g, "").split(",").map(Number);
    if (pids.includes(blockerPid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `session ${waitingPid} did not wait on ${blockerPid} within the deadline`,
  );
}

describe("Internal operator overlapping PostgreSQL transactions", () => {
  const admin = createAdminClient();
  const createdUserIds = new Set<string>();

  async function createUser(prefix: string) {
    const created = await createTestUser(admin, uniqueEmail(prefix));
    createdUserIds.add(created.user.id);
    return created;
  }

  it("holds a revoke behind an in-flight audit append until commit, then denies", async () => {
    const { user } = await createUser("overlap-revoke");
    const id = sqlUuidLiteral(user.id);

    const enabled = await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: user.id,
      p_actor_user_id: user.id,
      p_enabled: true,
      p_reason: reason,
    });
    expect(enabled.error).toBeNull();

    const control = await openLocalSqlSession(testUrl);
    const holder = await openLocalSqlSession(testUrl);
    const revoker = await openLocalSqlSession(testUrl);
    let revokeSettled = false;
    let revokeOutcome: Promise<string> | undefined;
    try {
      const holderPid = Number(await holder.query("SELECT pg_backend_pid();"));
      const revokerPid = Number(
        await revoker.query("SELECT pg_backend_pid();"),
      );

      // Transaction A appends the required view audit under the shared row
      // lock and stays open.
      await holder.query(
        `BEGIN; SELECT public.record_internal_operation_access(${id}, 'INTERNAL_ACCESS_VIEW');`,
      );

      // Transaction B tries to revoke the same mapping.
      revokeOutcome = revoker
        .query(
          `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, false, '${reason}'); COMMIT;`,
        )
        .then((output) => {
          revokeSettled = true;
          return output;
        });

      await waitUntilBlockedBy(control, revokerPid, holderPid);
      expect(revokeSettled).toBe(false);

      await holder.query("COMMIT;");
      expect(await revokeOutcome).toBe("t");

      // The next guarded append for the revoked operator is denied.
      const afterRevoke = await admin.rpc("record_internal_operation_access", {
        p_operator_user_id: user.id,
        p_operation_category: "INTERNAL_ACCESS_VIEW",
      });
      expect(afterRevoke.error).not.toBeNull();

      const mapping = await admin
        .from("internal_operators")
        .select("enabled")
        .eq("user_id", user.id)
        .single();
      expect(mapping.data?.enabled).toBe(false);

      const audits = await admin
        .from("internal_access_audit")
        .select("operation")
        .eq("operator_user_id", user.id);
      expect((audits.data ?? []).map((row) => row.operation).sort()).toEqual([
        "INTERNAL_ACCESS_VIEW",
        "OPERATOR_PROVISIONED",
        "OPERATOR_REVOKED",
      ]);
    } finally {
      await holder.close();
      await revoker.close();
      await control.close();
      await revokeOutcome?.catch(() => undefined);
    }
  });

  it("serializes overlapping first grants into one mapping and one provisioning event", async () => {
    const { user } = await createUser("overlap-grant");
    const id = sqlUuidLiteral(user.id);

    const control = await openLocalSqlSession(testUrl);
    const holder = await openLocalSqlSession(testUrl);
    const second = await openLocalSqlSession(testUrl);
    let secondSettled = false;
    let secondOutcome: Promise<string> | undefined;
    try {
      const holderPid = Number(await holder.query("SELECT pg_backend_pid();"));
      const secondPid = Number(await second.query("SELECT pg_backend_pid();"));

      // Transaction A is the first grant for a previously unmapped operator.
      // It holds the per-operator advisory lock until commit.
      expect(
        await holder.query(
          `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, true, '${reason}');`,
        ),
      ).toBe("t");

      // Transaction B is a same-state grant that overlaps at the lock point.
      secondOutcome = second
        .query(
          `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, true, '${reason}'); COMMIT;`,
        )
        .then((output) => {
          secondSettled = true;
          return output;
        });

      await waitUntilBlockedBy(control, secondPid, holderPid);
      expect(secondSettled).toBe(false);

      await holder.query("COMMIT;");
      // After A commits, B sees the enabled mapping and returns the no-op.
      expect(await secondOutcome).toBe("f");

      const mapping = await admin
        .from("internal_operators")
        .select("enabled")
        .eq("user_id", user.id);
      expect(mapping.data).toHaveLength(1);
      expect(mapping.data?.[0]?.enabled).toBe(true);

      const provisioned = await admin
        .from("internal_access_audit")
        .select("event_id")
        .eq("operator_user_id", user.id)
        .eq("operation", "OPERATOR_PROVISIONED");
      expect(provisioned.data).toHaveLength(1);

      const repeated = await admin.rpc("change_internal_operator_access", {
        p_operator_user_id: user.id,
        p_actor_user_id: user.id,
        p_enabled: true,
        p_reason: reason,
      });
      expect(repeated.data).toBe(false);
    } finally {
      await holder.close();
      await second.close();
      await control.close();
      await secondOutcome?.catch(() => undefined);
    }
  });

  // Only disposable auth identities are created here (never Provider rows);
  // audit rows stay append-only by design and are intentionally not deleted.
  afterAll(async () => {
    await cleanupFixture(admin, { userIds: [...createdUserIds] });
  });
});
