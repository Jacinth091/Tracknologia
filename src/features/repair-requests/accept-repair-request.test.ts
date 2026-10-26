import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  requireProviderContext,
  createRepairFromRequest,
  getRepairRequestRecord,
} = vi.hoisted(() => ({
  requireProviderContext: vi.fn(),
  createRepairFromRequest: vi.fn(),
  getRepairRequestRecord: vi.fn(),
}));

vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  requireProviderContext,
}));

vi.mock("@/features/repairs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/repairs")>()),
  createRepairFromRequest,
}));

vi.mock("./persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./persistence")>()),
  getRepairRequestRecord,
}));

import { acceptRepairRequest } from "./commands";
import type { AcceptRepairRequestDecision, RepairRequestDetail } from "./types";
import { RepairError } from "@/features/repairs";

const REQUEST_ID = "00000000-0000-4000-8000-0000000000aa";
const CLIENT = {} as unknown as SupabaseClient;

function storedRequest(
  overrides: Partial<RepairRequestDetail> = {},
): RepairRequestDetail {
  return {
    id: REQUEST_ID,
    referenceCode: "REQ-0123456789ABCDEF",
    providerId: "provider-a",
    customerName: "Juan Dela Cruz",
    customerPhone: "09175550101",
    customerEmail: "juan@example.com",
    deviceType: "Laptop",
    brand: "Lenovo",
    model: "IdeaPad 3",
    serialNumber: "SN-1",
    colorVariant: null,
    deviceSpecs: null,
    reportedProblem: "Battery no longer charges.",
    status: "SUBMITTED",
    submittedAt: "2026-10-01T00:00:00.000Z",
    problemStartedAt: null,
    precedingEvent: null,
    troubleshootingAttempted: null,
    additionalInformation: null,
    preferredServiceMode: "DROP_OFF",
    serviceModeDetails: "Meet near the station",
    acceptedAt: null,
    declinedAt: null,
    acceptedByUserId: null,
    declinedByUserId: null,
    ...overrides,
  };
}

function passedSnapshot() {
  return createRepairFromRequest.mock.calls[0]?.[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireProviderContext.mockResolvedValue({ providerId: "provider-a" });
  getRepairRequestRecord.mockResolvedValue(storedRequest());
  createRepairFromRequest.mockResolvedValue({
    repairId: "repair-1",
    ticketNumber: "TN-0001",
    trackingCode: "TRK-0123456789ABCDEF01234567",
    currentStatus: "IN_PROGRESS",
  });
});

describe("accepting a Repair Request", () => {
  it("builds the Repair snapshot from the stored Request and ignores forged fields", async () => {
    const forged = {
      serviceMode: "MEETUP",
      internalNotes: "Keys in drawer",
      customerName: "Forged Name",
      customerPhone: "0000",
      deviceType: "Forged device",
      reportedProblem: "Forged problem",
    } as AcceptRepairRequestDecision;

    await acceptRepairRequest(REQUEST_ID, forged, CLIENT);

    expect(createRepairFromRequest).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({
        customerName: "Juan Dela Cruz",
        customerPhone: "09175550101",
        customerEmail: "juan@example.com",
        deviceType: "Laptop",
        brand: "Lenovo",
        model: "IdeaPad 3",
        serialNumber: "SN-1",
        reportedProblem: "Battery no longer charges.",
        serviceMode: "MEETUP",
        internalNotes: "Keys in drawer",
      }),
      CLIENT,
    );
    expect(JSON.stringify(passedSnapshot())).not.toContain("Forged");
  });

  it("uses only decision fields and falls back to the preferred Service Mode", async () => {
    await acceptRepairRequest(REQUEST_ID, {}, CLIENT);

    expect(passedSnapshot()).toMatchObject({ serviceMode: "DROP_OFF" });
  });

  it("treats an empty Service Mode as no Service Mode", async () => {
    await acceptRepairRequest(REQUEST_ID, { serviceMode: "" }, CLIENT);

    expect(passedSnapshot().serviceMode).toBeUndefined();
  });

  it("keeps the arrangement details the Provider enters", async () => {
    await acceptRepairRequest(
      REQUEST_ID,
      { serviceMode: "HOME_SERVICE", serviceModeDetails: "Saturday morning" },
      CLIENT,
    );

    expect(passedSnapshot()).toMatchObject({
      serviceMode: "HOME_SERVICE",
      serviceModeDetails: "Saturday morning",
    });
  });

  it("looks the Request up with the signed-in Provider", async () => {
    await acceptRepairRequest(REQUEST_ID, {}, CLIENT);

    expect(getRepairRequestRecord).toHaveBeenCalledWith(
      CLIENT,
      "provider-a",
      REQUEST_ID,
    );
  });

  it("rejects an unknown Service Mode before reading the Request", async () => {
    await expect(
      acceptRepairRequest(REQUEST_ID, { serviceMode: "PICKUP" }, CLIENT),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(getRepairRequestRecord).not.toHaveBeenCalled();
    expect(createRepairFromRequest).not.toHaveBeenCalled();
  });

  it("rejects arrangement details without a Service Mode", async () => {
    await expect(
      acceptRepairRequest(
        REQUEST_ID,
        { serviceMode: "", serviceModeDetails: "Meet at the mall" },
        CLIENT,
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(createRepairFromRequest).not.toHaveBeenCalled();
  });

  it("reports a missing Request as not found and creates nothing", async () => {
    getRepairRequestRecord.mockResolvedValue(null);

    await expect(
      acceptRepairRequest(REQUEST_ID, {}, CLIENT),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND" });

    expect(createRepairFromRequest).not.toHaveBeenCalled();
  });

  it.each(["ACCEPTED", "DECLINED"] as const)(
    "refuses a Request that is already %s",
    async (status) => {
      getRepairRequestRecord.mockResolvedValue(storedRequest({ status }));

      await expect(
        acceptRepairRequest(REQUEST_ID, {}, CLIENT),
      ).rejects.toMatchObject({ code: "REQUEST_ALREADY_PROCESSED" });

      expect(createRepairFromRequest).not.toHaveBeenCalled();
    },
  );

  it("maps a rejected Repair snapshot to INVALID_INPUT", async () => {
    createRepairFromRequest.mockRejectedValue(
      new RepairError(
        "Customer name must be at least 2 characters",
        "INVALID_INPUT",
      ),
    );

    await expect(
      acceptRepairRequest(REQUEST_ID, {}, CLIENT),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Customer name must be at least 2 characters",
    });
  });
});
