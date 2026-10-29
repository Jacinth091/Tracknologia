import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  cleanupFixture,
  createAdminClient,
  createAnonClient,
  createTestUser,
  requireDbConfig,
  signInTestUser,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import { expectRpcPermissionDenied } from "./helpers/shared-test-utils";

requireDbConfig();

const reason = "integration disposable operator change";

function expectTablePermissionDenied(result: {
  error: { code?: string; message: string } | null;
}): void {
  expect(result.error).not.toBeNull();
  expect(result.error?.code).toBe("42501");
}

describe("Internal operator access and audit", () => {
  let admin: ReturnType<typeof createAdminClient>;
  let anon: ReturnType<typeof createAnonClient>;
  const createdUserIds = new Set<string>();

  beforeAll(() => {
    admin = createAdminClient();
    anon = createAnonClient();
  });

  async function changeAccess(
    operatorUserId: string,
    actorUserId: string,
    enabled: boolean,
  ): Promise<boolean> {
    const { data, error } = await admin.rpc(
      "change_internal_operator_access",
      {
        p_operator_user_id: operatorUserId,
        p_actor_user_id: actorUserId,
        p_enabled: enabled,
        p_reason: reason,
      },
    );
    if (error) {
      throw new Error(
        `change_internal_operator_access failed: ${error.message}`,
      );
    }
    return data as boolean;
  }

  async function createUser(prefix: string) {
    const created = await createTestUser(admin, uniqueEmail(prefix));
    createdUserIds.add(created.user.id);
    return created;
  }

  it("denies direct table access to ordinary clients", async () => {
    const { user, email, password } = await createUser("internal-direct");
    await changeAccess(user.id, user.id, true);
    const { client } = await signInTestUser(email, password);

    const cases = [
      {
        table: "internal_operators",
        insert: { user_id: user.id },
        filter: { column: "user_id", value: user.id },
      },
      {
        table: "internal_access_audit",
        insert: { operation: "INTERNAL_ACCESS_VIEW" },
        filter: { column: "event_id", value: randomUUID() },
      },
    ] as const;

    for (const { table, insert, filter } of cases) {
      expectTablePermissionDenied(await anon.from(table).select("*"));
      expectTablePermissionDenied(await client.from(table).select("*"));

      const inserted = await client
        .from(table)
        .insert(insert)
        .select();
      expectTablePermissionDenied(inserted);

      const updated = await client
        .from(table)
        .update(insert)
        .eq(filter.column, filter.value)
        .select();
      expectTablePermissionDenied(updated);

      const deleted = await client
        .from(table)
        .delete()
        .eq(filter.column, filter.value);
      expectTablePermissionDenied(deleted);
    }
  });

  it("denies the admin function to ordinary roles", async () => {
    const { user, email, password } = await createUser("internal-rpc");
    const adminArgs = {
      p_operator_user_id: user.id,
      p_actor_user_id: user.id,
      p_enabled: true,
      p_reason: reason,
    };

    expectRpcPermissionDenied(
      await anon.rpc("change_internal_operator_access", adminArgs),
    );

    const { client } = await signInTestUser(email, password);
    expectRpcPermissionDenied(
      await client.rpc("change_internal_operator_access", adminArgs),
    );
  });

  it("service role reads but cannot mutate private tables", async () => {
    const operatorRead = await admin
      .from("internal_operators")
      .select("user_id")
      .limit(1);
    expect(operatorRead.error).toBeNull();

    const auditRead = await admin
      .from("internal_access_audit")
      .select("event_id")
      .limit(1);
    expect(auditRead.error).toBeNull();

    const operatorInsert = await admin.from("internal_operators").insert({
      user_id: randomUUID(),
    });
    expectTablePermissionDenied(operatorInsert);

    const operatorUpdate = await admin
      .from("internal_operators")
      .update({ enabled: true })
      .eq("user_id", randomUUID());
    expectTablePermissionDenied(operatorUpdate);

    const operatorDelete = await admin
      .from("internal_operators")
      .delete()
      .eq("user_id", randomUUID());
    expectTablePermissionDenied(operatorDelete);
    expectTablePermissionDenied(
      await admin
        .from("internal_access_audit")
        .insert({ operation: "INTERNAL_ACCESS_VIEW" }),
    );
    expectTablePermissionDenied(
      await admin
        .from("internal_access_audit")
        .update({ operation: "OPERATOR_REVOKED" })
        .eq("event_id", randomUUID()),
    );
    expectTablePermissionDenied(
      await admin
        .from("internal_access_audit")
        .delete()
        .eq("event_id", randomUUID()),
    );
  });

  it("is an atomic, idempotent grant/revoke with audit rollback", async () => {
    const { user } = await createUser("internal-atomic");

    expect(await changeAccess(user.id, user.id, true)).toBe(true);
    const mapping = await admin
      .from("internal_operators")
      .select("enabled")
      .eq("user_id", user.id)
      .single();
    expect(mapping.data?.enabled).toBe(true);

    const provisioned = await admin
      .from("internal_access_audit")
      .select("event_id")
      .eq("operator_user_id", user.id)
      .eq("operation", "OPERATOR_PROVISIONED");
    expect(provisioned.data).toHaveLength(1);

    expect(await changeAccess(user.id, user.id, true)).toBe(false);
    expect(await changeAccess(user.id, user.id, false)).toBe(true);
    expect(await changeAccess(user.id, user.id, false)).toBe(false);

    const auditRows = await admin
      .from("internal_access_audit")
      .select("operation")
      .eq("operator_user_id", user.id);
    const operations = (auditRows.data ?? [])
      .map((row) => row.operation)
      .sort();
    expect(operations).toEqual(["OPERATOR_PROVISIONED", "OPERATOR_REVOKED"]);

    // Revoking an absent mapping never grants access.
    const { user: absent } = await createUser("internal-absent");
    expect(await changeAccess(absent.id, absent.id, false)).toBe(false);
    const absentMapping = await admin
      .from("internal_operators")
      .select("user_id")
      .eq("user_id", absent.id);
    expect(absentMapping.data).toHaveLength(0);

    // An invalid actor breaks the audit FK after the mapping write, so the
    // whole admin change rolls back.
    const { user: rollbackTarget } = await createUser("internal-rollback");
    const failed = await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: rollbackTarget.id,
      p_actor_user_id: randomUUID(),
      p_enabled: true,
      p_reason: reason,
    });
    expect(failed.error).not.toBeNull();
    expect(failed.error?.code).toBe("23503");

    const rolledBackMapping = await admin
      .from("internal_operators")
      .select("user_id")
      .eq("user_id", rollbackTarget.id);
    expect(rolledBackMapping.data).toHaveLength(0);

    const rolledBackAudit = await admin
      .from("internal_access_audit")
      .select("event_id")
      .eq("operator_user_id", rollbackTarget.id);
    expect(rolledBackAudit.data).toHaveLength(0);

    // A nonexistent operator identity fails the mapping FK before any audit.
    const unknown = await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: randomUUID(),
      p_actor_user_id: user.id,
      p_enabled: true,
      p_reason: reason,
    });
    expect(unknown.error).not.toBeNull();
    expect(unknown.error?.code).toBe("23503");
  });

  it("audits mapped access and denies disabled operators", async () => {
    const { user, email, password } = await createUser("internal-audit");
    await changeAccess(user.id, user.id, true);
    const { client } = await signInTestUser(email, password);

    // The audit RPC is a service-role-only seam, never a publishable-key
    // write surface, even for an enabled operator.
    expectRpcPermissionDenied(
      await client.rpc("record_internal_operation_access", {
        p_operator_user_id: user.id,
        p_operation_category: "INTERNAL_ACCESS_VIEW",
      }),
    );

    const audited = await admin.rpc("record_internal_operation_access", {
      p_operator_user_id: user.id,
      p_operation_category: "INTERNAL_ACCESS_VIEW",
    });
    expect(audited.error).toBeNull();
    expect(typeof audited.data).toBe("string");

    const rows = await admin
      .from("internal_access_audit")
      .select("event_id, operator_user_id, actor_user_id, operation, reason")
      .eq("operator_user_id", user.id)
      .eq("operation", "INTERNAL_ACCESS_VIEW");
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0]).toMatchObject({
      operator_user_id: user.id,
      actor_user_id: user.id,
      operation: "INTERNAL_ACCESS_VIEW",
      reason: null,
    });

    // The appended event stays append-only for the service role too.
    const eventId = rows.data?.[0]?.event_id;
    expectTablePermissionDenied(
      await admin
        .from("internal_access_audit")
        .update({ operation: "OPERATOR_REVOKED" })
        .eq("event_id", eventId),
    );
    expectTablePermissionDenied(
      await admin
        .from("internal_access_audit")
        .delete()
        .eq("event_id", eventId),
    );

    // Provision/revoke categories cannot be forged through the audit RPC.
    const forged = await admin.rpc("record_internal_operation_access", {
      p_operator_user_id: user.id,
      p_operation_category: "OPERATOR_PROVISIONED",
    });
    expect(forged.error).not.toBeNull();

    // The enabled mapping is rechecked at write time, so revocation wins even
    // for a delayed privileged append.
    await changeAccess(user.id, user.id, false);
    const afterRevoke = await admin.rpc("record_internal_operation_access", {
      p_operator_user_id: user.id,
      p_operation_category: "INTERNAL_ACCESS_VIEW",
    });
    expect(afterRevoke.error).not.toBeNull();
  });

  it("auth deletion removes mapping and anonymizes audit", async () => {
    const { user } = await createUser("internal-delete");
    await changeAccess(user.id, user.id, true);
    await changeAccess(user.id, user.id, false);

    const before = await admin
      .from("internal_access_audit")
      .select("event_id")
      .eq("operator_user_id", user.id);
    expect(before.data).toHaveLength(2);
    const eventIds = (before.data ?? []).map((row) => row.event_id);

    const deleted = await admin.auth.admin.deleteUser(user.id);
    expect(deleted.error).toBeNull();
    createdUserIds.delete(user.id);

    const mapping = await admin
      .from("internal_operators")
      .select("user_id")
      .eq("user_id", user.id);
    expect(mapping.data).toHaveLength(0);

    const after = await admin
      .from("internal_access_audit")
      .select("operator_user_id, actor_user_id, operation")
      .in("event_id", eventIds);
    expect(after.data).toHaveLength(2);
    for (const row of after.data ?? []) {
      expect(row.operator_user_id).toBeNull();
      expect(row.actor_user_id).toBeNull();
      expect(row.operation).toBeDefined();
    }
  });

  it("denies the audit RPC to ordinary clients", async () => {
    expectRpcPermissionDenied(
      await anon.rpc("record_internal_operation_access", {
        p_operator_user_id: randomUUID(),
        p_operation_category: "INTERNAL_ACCESS_VIEW",
      }),
    );

    const { user, email, password } = await createUser("internal-unmapped");
    const { client } = await signInTestUser(email, password);
    expectRpcPermissionDenied(
      await client.rpc("record_internal_operation_access", {
        p_operator_user_id: user.id,
        p_operation_category: "INTERNAL_ACCESS_VIEW",
      }),
    );
  });

  // Only disposable auth identities are created here (never Provider rows);
  // audit rows stay append-only by design and are intentionally not deleted.
  afterAll(async () => {
    await cleanupFixture(admin, { userIds: [...createdUserIds] });
  });
});
