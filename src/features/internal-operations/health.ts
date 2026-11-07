import "server-only";

import { getServerConfig } from "@/lib/config/server";
import { createPublicOperationClient } from "@/lib/supabase/service";

/**
 * Truthful operator-facing health states. "stale" belongs to externally
 * observed signals (the uptime observer); "unknown" means nothing was probed
 * and must never be displayed as healthy or zero.
 */
export type HealthStatus =
  "healthy" | "degraded" | "unavailable" | "unknown" | "stale";

export interface HealthCheck {
  status: HealthStatus;
  /** Probe duration in milliseconds; null when nothing was probed. */
  latencyMs: number | null;
  /** UTC instant of the probe; null when nothing was probed. */
  observedAt: string | null;
}

export interface InternalHealth {
  checkedAt: string;
  application: HealthCheck;
  database: HealthCheck;
  auth: HealthCheck;
  email: HealthCheck;
}

const PROBE_TIMEOUT_MS = 3000;
// A probe that succeeds but crawls is degraded, not healthy.
const DEGRADED_LATENCY_MS = 1000;

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

function probeResult(latencyMs: number): HealthCheck {
  return {
    status: latencyMs >= DEGRADED_LATENCY_MS ? "degraded" : "healthy",
    latencyMs,
    observedAt: new Date().toISOString(),
  };
}

function probeFailure(check: string, error?: unknown): HealthCheck {
  console.error(`[HEALTH_FAILURE] ${check} probe failed`, {
    code: loggableCode(error),
  });
  return {
    status: "unavailable",
    latencyMs: null,
    observedAt: new Date().toISOString(),
  };
}

// Same bounded, content-free round trip the public readiness probe uses: a
// head-only, single-row read that returns no table content.
async function probeDatabase(): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    const client = await createPublicOperationClient();
    const { error } = await client
      .from("providers")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));

    if (error) {
      return probeFailure("database", error);
    }
    return probeResult(Math.round(performance.now() - startedAt));
  } catch (error) {
    return probeFailure("database", error);
  }
}

// Supabase Auth exposes a public health endpoint that returns only a version.
async function probeAuth(): Promise<HealthCheck> {
  const config = getServerConfig();
  const startedAt = performance.now();
  try {
    const response = await fetch(`${config.supabase.url}/auth/v1/health`, {
      headers: { apikey: config.supabase.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return probeFailure("auth");
    }
    return probeResult(Math.round(performance.now() - startedAt));
  } catch (error) {
    return probeFailure("auth", error);
  }
}

// Email is never claimed healthy without a real probe. A transport that is not
// configured cannot send at all, so it is unavailable rather than unknown.
function checkEmail(): HealthCheck {
  const smtpConfigured = Boolean(getServerConfig().email.smtp);
  return {
    status: smtpConfigured ? "unknown" : "unavailable",
    latencyMs: null,
    observedAt: null,
  };
}

export async function getInternalHealth(): Promise<InternalHealth> {
  const checkedAt = new Date().toISOString();
  const [database, auth] = await Promise.all([probeDatabase(), probeAuth()]);

  return {
    checkedAt,
    application: {
      status: "healthy",
      latencyMs: null,
      observedAt: checkedAt,
    },
    database,
    auth,
    email: checkEmail(),
  };
}
