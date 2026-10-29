/**
 * Fixed sensitive-operation categories accepted by the application access
 * audit. Provision/revoke categories are deliberately absent: only the
 * service-role admin function may record them.
 */
export const INTERNAL_OPERATION_CATEGORIES = ["INTERNAL_ACCESS_VIEW"] as const;

export type InternalOperationCategory =
  (typeof INTERNAL_OPERATION_CATEGORIES)[number];

/**
 * Deliberate, safe-to-render outcome of the internal-operator guard.
 *
 * ALLOWED is the only outcome that may render protected internal content.
 */
export type InternalAccess =
  | { status: "ALLOWED"; userId: string }
  | { status: "UNAUTHENTICATED" }
  | { status: "FORBIDDEN" }
  | { status: "UNAVAILABLE" };
