import "server-only";
import { createInternalOpsClient } from "@/lib/supabase/internal";
import type { InternalOperationCategory } from "./types";

interface InternalOperatorRow {
  user_id: string;
  enabled: boolean;
}

/**
 * Exact-user lookup of the private internal-operator mapping.
 *
 * There is no process/global cache: the mapping is read on every guarded
 * request so a revocation takes effect on the next request.
 */
export type InternalOperatorLookup =
  | { status: "ENABLED" }
  | { status: "DISABLED" }
  | { status: "MISSING" }
  | { status: "ERROR" };

export async function findInternalOperator(
  userId: string,
): Promise<InternalOperatorLookup> {
  const client = await createInternalOpsClient();
  const { data, error } = await client
    .from("internal_operators")
    .select("user_id, enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      "[INTERNAL_ACCESS_FAILURE] internal operator lookup failed",
      {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      },
    );
    return { status: "ERROR" };
  }

  if (!data) {
    return { status: "MISSING" };
  }

  const row = data as unknown as InternalOperatorRow;
  return row.enabled === true
    ? { status: "ENABLED" }
    : { status: "DISABLED" };
}

/**
 * Appends the required append-only audit event through the service-role-only
 * database function. The caller must pass the operator UUID it derived from
 * requireInternalOperator(); the database rechecks that the enabled mapping
 * still exists at write time.
 */
export async function appendInternalAccessAudit(
  operatorUserId: string,
  category: InternalOperationCategory,
): Promise<boolean> {
  const client = await createInternalOpsClient();
  const { error } = await client.rpc("record_internal_operation_access", {
    p_operator_user_id: operatorUserId,
    p_operation_category: category,
  });

  if (error) {
    console.error("[INTERNAL_AUDIT_FAILURE] access audit append failed", {
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return false;
  }

  return true;
}
