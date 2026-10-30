import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkReadiness } from "./readiness";

const CANARY = "db password leaked";

const seams = vi.hoisted(() => ({
  createPublicOperationClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: seams.createPublicOperationClient,
}));

// Mirrors the chain checkReadiness builds. `outcome` is what the awaited
// abortSignal() resolves with, or the error it rejects with.
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

describe("checkReadiness", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    seams.createPublicOperationClient.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("is healthy when the head-only probe returns no error", async () => {
    const client = clientReturning({ data: null, error: null });
    seams.createPublicOperationClient.mockResolvedValue(client);

    await expect(checkReadiness()).resolves.toBe("healthy");
    expect(client.from).toHaveBeenCalledWith("providers");
    expect(client.builder.select).toHaveBeenCalledWith("id", { head: true });
    expect(client.builder.limit).toHaveBeenCalledWith(1);
    expect(client.builder.abortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("is unavailable when the database returns an error", async () => {
    seams.createPublicOperationClient.mockResolvedValue(
      clientReturning({ error: { code: "28P01", message: CANARY } }),
    );

    await expect(checkReadiness()).resolves.toBe("unavailable");
  });

  it("is unavailable when the round trip times out or aborts", async () => {
    seams.createPublicOperationClient.mockResolvedValue(
      clientReturning(new DOMException("timed out", "TimeoutError"), true),
    );

    await expect(checkReadiness()).resolves.toBe("unavailable");
  });

  it("is unavailable when the client cannot be created", async () => {
    seams.createPublicOperationClient.mockRejectedValue(new Error(CANARY));

    await expect(checkReadiness()).resolves.toBe("unavailable");
  });

  it("never echoes the error text in the result or the logs", async () => {
    seams.createPublicOperationClient.mockResolvedValue(
      clientReturning({ code: "08006", message: CANARY }),
    );

    const result = await checkReadiness();

    expect(result).toBe("unavailable");
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(CANARY);
    expect(consoleError).toHaveBeenCalledWith(
      "[HEALTH_FAILURE] database readiness check failed",
      { code: "08006" },
    );
  });
});
