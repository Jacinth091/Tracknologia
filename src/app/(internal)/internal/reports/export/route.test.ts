import { beforeEach, describe, expect, it, vi } from "vitest";

const feature = vi.hoisted(() => {
  class MetricsError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  }
  return {
    MetricsError,
    getValidationMetrics: vi.fn(),
    requireInternalOperator: vi.fn(),
  };
});

// The real report builder and serializers run; only the guard and the metrics
// read are mocked, so the route's headers and bodies are the shipped ones.
vi.mock("@/features/internal-operations", async () => {
  const report = await import("@/features/internal-operations/report");
  return {
    MetricsError: feature.MetricsError,
    getValidationMetrics: feature.getValidationMetrics,
    requireInternalOperator: feature.requireInternalOperator,
    ...report,
  };
});

import type { ValidationMetrics } from "@/features/internal-operations";
import { GET } from "./route";

const fixture = {
  asOf: "2026-10-30T09:00:00.000Z",
  window: {
    mode: "7d",
    startDate: "2026-10-24",
    endDateExclusive: "2026-10-31",
    days: 7,
    timeZone: "Asia/Manila",
    startUtc: "2026-10-23T16:00:00.000Z",
    endUtc: "2026-10-30T16:00:00.000Z",
  },
  providers: {
    onboardedInPeriod: { shop: 4, independent: 3, total: 7 },
    allTime: { shop: 12, independent: 9, total: 21 },
  },
  activity: {
    distinctProviders: 6,
    repeatProviders: 2,
    daily: [{ date: "2026-10-24", distinctProviders: 6 }],
  },
  staff: { memberships: 5, shopsWithStaff: 3 },
  repairs: {
    statusNow: {
      IN_PROGRESS: 11,
      WAITING_FOR_PARTS: 2,
      AWAITING_APPROVAL: 1,
      READY: 4,
      COMPLETED: 33,
    },
    created: { total: 58, customerRequest: 40, providerCreated: 18 },
    completed: 13,
    readyReached: 9,
    statusMaintained: 7,
  },
  requests: {
    received: 47,
    decided: { total: 30, accepted: 22, declined: 8 },
    pendingNow: 5,
    cohortAccepted: 16,
    conversionPercent: 64,
    meanDecisionSeconds: 12000,
  },
  tracking: {
    periodViews: 215,
    periodRepairsViewed: 37,
    allTimeViews: 980,
    allTimeRepairsViewed: 150,
    allTimeRepairs: 300,
    adoptionPercent: 50,
  },
  feedback: null,
  coverage: {
    domain: {
      source: "AUTHORITATIVE_DOMAIN_TABLES",
      coverage: "RETAINED_ROWS_ONLY",
      snapshot: "CURRENT_STATE",
      observedEndUtc: "2026-10-30T09:00:00.000Z",
    },
    feedback: {
      source: "FEEDBACK_MODULE",
      coverage: "RETAINED_ROWS_ONLY",
      status: "UNAVAILABLE",
      asOfStart: "2026-10-30T09:00:00.000Z",
      asOfEnd: "2026-10-30T09:00:00.000Z",
      batches: 0,
    },
    retentionPolicy: "APPROVED",
  },
} satisfies ValidationMetrics;

function request(query: string) {
  return new Request(
    `https://tracknologia.test/internal/reports/export${query}`,
  );
}

describe("Validation report export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feature.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-user",
    });
    feature.getValidationMetrics.mockResolvedValue(fixture);
  });

  it("rejects a missing or unknown format before touching anything", async () => {
    const missing = await GET(request("?period=7d"));
    const unknown = await GET(request("?format=xlsx"));

    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(feature.requireInternalOperator).not.toHaveBeenCalled();
  });

  it("requires an internal operator session", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAUTHENTICATED",
    });
    expect((await GET(request("?format=csv"))).status).toBe(401);

    feature.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });
    expect((await GET(request("?format=csv"))).status).toBe(404);

    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAVAILABLE",
    });
    expect((await GET(request("?format=csv"))).status).toBe(503);
    expect(feature.getValidationMetrics).not.toHaveBeenCalled();
  });

  it("maps an invalid window to 400 and keeps unexpected faults loud", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new feature.MetricsError("bad window", "INVALID_INPUT"),
    );
    expect((await GET(request("?format=csv"))).status).toBe(400);

    feature.getValidationMetrics.mockRejectedValue(new Error("boom"));
    await expect(GET(request("?format=csv"))).rejects.toThrow("boom");
  });

  it("downloads CSV with no-store and an attachment filename", async () => {
    const response = await GET(request("?format=csv&period=7d"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="validation-report-2026-10-24-to-2026-10-31.csv"',
    );
    const body = await response.text();
    expect(body.split("\n")[0]).toBe(
      "section,metric,bucket,value,unit,suppressed",
    );
    expect(body).toContain("providers,onboarded_in_period,SHOP,,");
  });

  it("downloads JSON with the window and no identifiers", async () => {
    const response = await GET(request("?format=json&period=7d"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    const report = await response.json();
    expect(report.source).toBe("INTERNAL_VALIDATION_METRICS");
    expect(report.window.startDate).toBe("2026-10-24");
    expect(report.suppression).toEqual({ minimumGroup: 5, applied: true });
    expect(JSON.stringify(report)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i,
    );
  });

  it("passes a custom range through to the metrics read", async () => {
    await GET(
      request("?format=csv&period=custom&start=2026-10-24&end=2026-10-31"),
    );

    expect(feature.getValidationMetrics).toHaveBeenCalledWith({
      mode: "custom",
      startDate: "2026-10-24",
      endDateExclusive: "2026-10-31",
    });
  });
});
