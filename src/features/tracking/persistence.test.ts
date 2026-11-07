import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { lookupPublicRepairRecord } from "./persistence";

const TRACKING_CODE = "TRK-0123456789ABCDEF01234567";
const PRIVATE_DEVICE = "PRIVATE-DEVICE-VALUE-7Q4M";

function clientReturning(row: Record<string, unknown>): SupabaseClient {
  const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
  return { rpc } as unknown as SupabaseClient;
}

describe("lookupPublicRepairRecord", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the failing field path and code, never row values, then throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const row: Record<string, unknown> = {
      provider_display_name: "Jacinth Device Care",
      device_type: PRIVATE_DEVICE,
      brand: "Lenovo",
      model: "IdeaPad 3",
      current_status: "IN_PROGRESS",
      service_mode: "DROP_OFF",
      last_updated_at: "2026-08-24T03:00:00.000Z",
      customer_updates: [],
      reference_code: TRACKING_CODE,
    };

    await expect(
      lookupPublicRepairRecord(clientReturning(row), TRACKING_CODE),
    ).rejects.toThrow("Public Tracking projection is invalid");

    expect(consoleError).toHaveBeenCalledOnce();
    const logged = String(consoleError.mock.calls[0]?.[0]);
    expect(logged).toContain("tracking_type");
    expect(logged).not.toContain(PRIVATE_DEVICE);
    expect(logged).not.toContain(TRACKING_CODE);
    expect(logged).not.toContain("Jacinth Device Care");
  });
});
