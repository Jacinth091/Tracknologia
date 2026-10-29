import "server-only";
import { AuthError, requireUser } from "@/features/auth";
import { appendInternalAccessAudit, findInternalOperator } from "./persistence";
import type { InternalAccess, InternalOperationCategory } from "./types";

/**
 * Resolves the trusted internal-operator access outcome for the current
 * request.
 *
 * The identity comes only from the authenticated session; Provider context,
 * user metadata, and browser-supplied roles are never consulted. Missing or
 * disabled mappings are FORBIDDEN, an expected anonymous request is
 * UNAUTHENTICATED, and any auth or database fault is UNAVAILABLE so callers
 * fail closed without logging the user out.
 */
export async function requireInternalOperator(): Promise<InternalAccess> {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    if (err instanceof AuthError && err.code === "UNAUTHENTICATED") {
      return { status: "UNAUTHENTICATED" };
    }

    console.error(
      "[INTERNAL_ACCESS_FAILURE] authentication unavailable for internal access",
      {
        message: err instanceof Error ? err.message : "unknown",
        timestamp: new Date().toISOString(),
      },
    );
    return { status: "UNAVAILABLE" };
  }

  try {
    const lookup = await findInternalOperator(user.id);

    if (lookup.status === "ENABLED") {
      return { status: "ALLOWED", userId: user.id };
    }

    if (lookup.status === "ERROR") {
      return { status: "UNAVAILABLE" };
    }

    return { status: "FORBIDDEN" };
  } catch (err) {
    console.error(
      "[INTERNAL_ACCESS_FAILURE] internal operator access check failed",
      {
        message: err instanceof Error ? err.message : "unknown",
        timestamp: new Date().toISOString(),
      },
    );
    return { status: "UNAVAILABLE" };
  }
}

/**
 * Appends the audit event a sensitive internal operation requires. Any failure
 * returns false so callers deny the operation instead of rendering protected
 * content unrecorded.
 */
export async function recordSensitiveInternalAccess(
  category: InternalOperationCategory,
): Promise<boolean> {
  try {
    return await appendInternalAccessAudit(category);
  } catch (err) {
    console.error("[INTERNAL_AUDIT_FAILURE] access audit append threw", {
      message: err instanceof Error ? err.message : "unknown",
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}
