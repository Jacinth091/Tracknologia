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
  waitUntilBlockedBy,
  type LocalSqlSession,
} from "../helpers/local-postgres";

requireDbConfig();

const reason = "integration overlap operator change";
const OVERLAP_TEST_TIMEOUT_MS = 60_000;

describe("Internal operator overlapping PostgreSQL transactions", () => {
  const admin = createAdminClient();
  const createdUserIds = new Set<string>();

  async function createUser(prefix: string) {
    const created = await createTestUser(admin, uniqueEmail(prefix));
    createdUserIds.add(created.user.id);
    return created;
  }

  it(
    "holds a revoke behind an in-flight audit append until commit, then denies",
    async () => {
      const { user } = await createUser("overlap-revoke");
      const id = sqlUuidLiteral(user.id);

      const enabled = await admin.rpc("change_internal_operator_access", {
        p_operator_user_id: user.id,
        p_actor_user_id: user.id,
        p_enabled: true,
        p_reason: reason,
      });
      expect(enabled.error).toBeNull();

      // Every acquired session is registered before the next open, so a
      // failed later open still closes the earlier ones in `finally`.
      const opened: LocalSqlSession[] = [];
      const open = async () => {
        const session = await openLocalSqlSession(testUrl);
        opened.push(session);
        return session;
      };
      try {
        const control = await open();
        const holder = await open();
        const revoker = await open();

        const holderPid = Number(
          await holder.query("SELECT pg_backend_pid();"),
        );
        const revokerPid = Number(
          await revoker.query("SELECT pg_backend_pid();"),
        );

        // Transaction A appends the required view audit under the shared row
        // lock and stays open.
        await holder.query(
          `BEGIN; SELECT public.record_internal_operation_access(${id}, 'INTERNAL_ACCESS_VIEW');`,
        );

        // Transaction B tries to revoke the same mapping. The rejection
        // observer is attached now; the assertion below still awaits the real
        // result, so a genuine error still fails the test.
        let revokeSettled = false;
        const revokeOutcome = revoker
          .query(
            `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, false, '${reason}'); COMMIT;`,
          )
          .then((output) => {
            revokeSettled = true;
            return output;
          });
        revokeOutcome.catch(() => undefined);

        await waitUntilBlockedBy(control, revokerPid, holderPid);
        expect(revokeSettled).toBe(false);

        await holder.query("COMMIT;");
        expect(await revokeOutcome).toBe("t");

        // The next guarded append for the revoked operator raises the
        // application's own denial (PL/pgSQL default P0001), not an
        // infrastructure error.
        const afterRevoke = await admin.rpc(
          "record_internal_operation_access",
          {
            p_operator_user_id: user.id,
            p_operation_category: "INTERNAL_ACCESS_VIEW",
          },
        );
        expect(afterRevoke.error?.code).toBe("P0001");
        expect(afterRevoke.error?.message).toContain(
          "Internal operator access required",
        );

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
        await Promise.allSettled(opened.map((session) => session.close()));
      }
    },
    OVERLAP_TEST_TIMEOUT_MS,
  );

  it(
    "serializes overlapping first grants into one mapping and one provisioning event",
    async () => {
      const { user } = await createUser("overlap-grant");
      const id = sqlUuidLiteral(user.id);

      const opened: LocalSqlSession[] = [];
      const open = async () => {
        const session = await openLocalSqlSession(testUrl);
        opened.push(session);
        return session;
      };
      try {
        const control = await open();
        const holder = await open();
        const second = await open();

        const holderPid = Number(
          await holder.query("SELECT pg_backend_pid();"),
        );
        const secondPid = Number(
          await second.query("SELECT pg_backend_pid();"),
        );

        // Transaction A is the first grant for a previously unmapped operator.
        // It holds the per-operator advisory lock until commit.
        expect(
          await holder.query(
            `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, true, '${reason}');`,
          ),
        ).toBe("t");

        // Transaction B is a same-state grant that overlaps at the lock point.
        let secondSettled = false;
        const secondOutcome = second
          .query(
            `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, true, '${reason}'); COMMIT;`,
          )
          .then((output) => {
            secondSettled = true;
            return output;
          });
        secondOutcome.catch(() => undefined);

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
        await Promise.allSettled(opened.map((session) => session.close()));
      }
    },
    OVERLAP_TEST_TIMEOUT_MS,
  );

  // Only disposable auth identities are created here (never Provider rows);
  // audit rows stay append-only by design and are intentionally not deleted.
  afterAll(async () => {
    await cleanupFixture(admin, { userIds: [...createdUserIds] });
  });
});
