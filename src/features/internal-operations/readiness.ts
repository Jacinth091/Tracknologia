import "server-only";

import { createPublicOperationClient } from "@/lib/supabase/service";

export type ReadinessStatus = "healthy" | "unavailable";

const READINESS_TIMEOUT_MS = 3000;

// Only SQLSTATE-shaped codes are logged. Messages, SQL text, URLs and secrets
// never reach logs, so a failing probe cannot leak configuration or data.
const LOGGABLE_CODE = /^[A-Z0-9]{5,8}$/;

function loggableCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    LOGGABLE_CODE.test(error.code)
  ) {
    return error.code;
  }
  return "unknown";
}

function unavailable(error?: unknown): ReadinessStatus {
  console.error("[HEALTH_FAILURE] database readiness check failed", {
    code: loggableCode(error),
  });
  return "unavailable";
}

// One bounded, real round trip: a head-only, single-row read that returns no
// table content. Healthy only when the app reaches its database without error.
export async function checkReadiness(): Promise<ReadinessStatus> {
  try {
    const client = await createPublicOperationClient();
    const { error } = await client
      .from("providers")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(READINESS_TIMEOUT_MS));

    if (error) {
      return unavailable(error);
    }
    return "healthy";
  } catch (error) {
    return unavailable(error);
  }
}
