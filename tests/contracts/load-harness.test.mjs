import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEnv } from "../../scripts/load/lib/env.mjs";
import { runBurst, summarize } from "../../scripts/load/lib/pool.mjs";
import {
  createAbuseBurst,
  createRaceSameRequest,
} from "../../scripts/load/scenarios.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("load harness safety and results", () => {
  it("refuses remote database and app targets", () => {
    vi.stubEnv("SUPABASE_TEST_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_TEST_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_TEST_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("SUPABASE_TEST_JWT_SECRET", "secret");
    vi.stubEnv("LOAD_APP_URL", "http://localhost:3000");
    expect(resolveEnv().url).toContain("127.0.0.1");
    vi.stubEnv("SUPABASE_TEST_URL", "https://example.supabase.co");
    expect(() => resolveEnv()).toThrow(/local host/);
    vi.stubEnv("SUPABASE_TEST_URL", "http://127.0.0.1:54321");
    vi.stubEnv("LOAD_APP_URL", "https://example.com");
    expect(() => resolveEnv()).toThrow(/local host/);
  });

  it("spreads workers across the ramp and counts error outcomes and HTTP statuses", async () => {
    const starts = [];
    const results = await runBurst({
      concurrency: 3,
      durationMs: 100,
      rampMs: 60,
      task: async () => {
        starts.push(performance.now());
        await new Promise((resolve) => setTimeout(resolve, 110));
        return { ok: true, kind: "error", httpStatus: 429 };
      },
    });
    expect(starts).toHaveLength(3);
    expect(starts[2] - starts[0]).toBeGreaterThanOrEqual(45);
    expect(summarize(results)).toMatchObject({
      errorCount: 3,
      httpStatusCounts: { 429: 3 },
    });
  });

  it("does not count a limiter outage as a denial", async () => {
    const task = createAbuseBurst({
      service: { rpc: async () => ({ error: { message: "offline" } }) },
    });
    expect(await task()).toMatchObject({ ok: false, error: "offline" });
  });

  it.each([
    [null, null],
    ["REQUEST_ALREADY_PROCESSED", "REQUEST_ALREADY_PROCESSED"],
    [null, "offline"],
  ])(
    "rejects invalid request race results",
    async (acceptError, declineError) => {
      const response = (message) => ({ error: message ? { message } : null });
      const service = {
        rpc: async () => ({ data: { reference_code: "ref" } }),
        from: (table) => ({
          select: () => ({
            eq: () =>
              table === "repairs"
                ? Promise.resolve({ data: [] })
                : {
                    single: async () => ({
                      data:
                        table === "repair_requests"
                          ? {
                              id: "id",
                              status: "DECLINED",
                              declined_at: "now",
                              accepted_at: null,
                            }
                          : null,
                    }),
                  },
          }),
        }),
      };
      const owner = {
        rpc: async (name) =>
          response(
            name === "create_repair_from_request" ? acceptError : declineError,
          ),
      };
      expect(
        (
          await createRaceSameRequest({
            service,
            owner,
            fixtures: { owner: { providerSlug: "local" } },
          })()
        ).ok,
      ).toBe(false);
    },
  );
  it("accepts a single winning decline only when durable state agrees", async () => {
    const service = {
      rpc: async () => ({ data: { reference_code: "ref" } }),
      from: (table) => ({
        select: () => ({
          eq: () =>
            table === "repairs"
              ? Promise.resolve({ data: [] })
              : {
                  single: async () => ({
                    data: {
                      id: "id",
                      status: "DECLINED",
                      declined_at: "now",
                      accepted_at: null,
                    },
                  }),
                },
        }),
      }),
    };
    const owner = {
      rpc: async (name) =>
        name === "create_repair_from_request"
          ? { error: { message: "REQUEST_ALREADY_PROCESSED" } }
          : { error: null },
    };
    expect(
      (
        await createRaceSameRequest({
          service,
          owner,
          fixtures: { owner: { providerSlug: "local" } },
        })()
      ).ok,
    ).toBe(true);
  });
});
