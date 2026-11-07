import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInternalHealth } from "./health";

const CANARY = "smtp-password-leaked";

const seams = vi.hoisted(() => ({
  createPublicOperationClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: seams.createPublicOperationClient,
}));

// Mirrors the chain the database probe builds.
function clientReturning(outcome: unknown, rejects = false) {
  const builder = {
    select: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    abortSignal: vi.fn(() =>
      rejects ? Promise.reject(outcome) : Promise.resolve(outcome),
    ),
  };
  return { from: vi.fn(() => builder), builder };
}

function fetchReturning(status: number) {
  return vi.fn(async () => new Response("{}", { status }));
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_pub_test_123456789012345678901234567890",
  );
  vi.stubEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "sb_service_test_123456789012345678901234567890",
  );
  vi.stubEnv(
    "PUBLIC_ABUSE_HMAC_SECRET",
    "test-only-secret-with-at-least-32-characters",
  );
  vi.stubEnv(
    "PUBLIC_ABUSE_TRUSTED_PROXY_SECRET",
    "test-only-proxy-proof-with-at-least-32-characters",
  );
  vi.stubEnv("PUBLIC_ABUSE_SHARED_DEV_BUCKET", "");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");

  seams.createPublicOperationClient.mockResolvedValue(
    clientReturning({ data: null, error: null }),
  );
  vi.stubGlobal("fetch", fetchReturning(200));
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getInternalHealth", () => {
  it("reports a live application, a live database and a live auth endpoint", async () => {
    const health = await getInternalHealth();

    expect(health.application.status).toBe("healthy");
    expect(health.database.status).toBe("healthy");
    expect(health.database.latencyMs).toEqual(expect.any(Number));
    expect(health.database.observedAt).toEqual(expect.any(String));
    expect(health.auth.status).toBe("healthy");
    expect(health.checkedAt).toEqual(expect.any(String));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("probes the Supabase Auth health endpoint with the publishable key only", async () => {
    await getInternalHealth();

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/auth/v1/health",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          apikey: "sb_pub_test_123456789012345678901234567890",
        },
      }),
    );
  });

  it("marks a reachable but slow probe as degraded rather than healthy", async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      elapsed += 2000;
      return elapsed;
    });

    const health = await getInternalHealth();

    expect(health.database.status).toBe("degraded");
    expect(health.auth.status).toBe("degraded");
  });

  it("reports the database unavailable when its probe errors, keeping the others", async () => {
    seams.createPublicOperationClient.mockResolvedValue(
      clientReturning({ error: { code: "28P01", message: CANARY } }),
    );

    const health = await getInternalHealth();

    expect(health.database.status).toBe("unavailable");
    expect(health.auth.status).toBe("healthy");
    expect(JSON.stringify(health)).not.toContain(CANARY);
  });

  it("reports the database unavailable when the client cannot be created", async () => {
    seams.createPublicOperationClient.mockRejectedValue(new Error(CANARY));

    const health = await getInternalHealth();

    expect(health.database.status).toBe("unavailable");
    expect(JSON.stringify(health)).not.toContain(CANARY);
  });

  it("reports auth unavailable on a non-2xx or failed request without leaking it", async () => {
    vi.stubGlobal("fetch", fetchReturning(503));
    let health = await getInternalHealth();
    expect(health.auth.status).toBe("unavailable");
    expect(health.database.status).toBe("healthy");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(CANARY);
      }),
    );
    health = await getInternalHealth();
    expect(health.auth.status).toBe("unavailable");
    expect(JSON.stringify(health)).not.toContain(CANARY);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(CANARY);
  });

  it("never claims email is healthy: unavailable without SMTP, unknown when configured", async () => {
    let health = await getInternalHealth();
    expect(health.email).toEqual({
      status: "unavailable",
      latencyMs: null,
      observedAt: null,
    });

    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "mailer@example.test");
    vi.stubEnv("SMTP_PASSWORD", CANARY);
    health = await getInternalHealth();
    expect(health.email).toEqual({
      status: "unknown",
      latencyMs: null,
      observedAt: null,
    });
    expect(JSON.stringify(health)).not.toContain(CANARY);
  });
});
