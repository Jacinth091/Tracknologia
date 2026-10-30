import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

const seams = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
}));

vi.mock("@/features/internal-operations", () => ({
  checkReadiness: seams.checkReadiness,
}));

// The public uptime probe reveals only the coarse readiness status.
describe("GET /api/health contract", () => {
  beforeEach(() => {
    seams.checkReadiness.mockReset();
  });

  it("returns 200 with only the healthy status when the database is reachable", async () => {
    seams.checkReadiness.mockResolvedValue("healthy");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "healthy" });
    expect(await response.clone().text()).toBe('{"status":"healthy"}');
  });

  it("returns 503 with only the unavailable status when the database is not reachable", async () => {
    seams.checkReadiness.mockResolvedValue("unavailable");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(await response.clone().text()).toBe('{"status":"unavailable"}');
  });

  it("exposes no keys beyond status", async () => {
    seams.checkReadiness.mockResolvedValue("healthy");

    const body = await (await GET()).json();

    expect(Object.keys(body)).toEqual(["status"]);
  });
});
