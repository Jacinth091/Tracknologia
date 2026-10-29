import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildValidationMetrics,
  type ValidationMetricsWindow,
  metricsRowSchema,
  getValidationMetrics,
} from "./metrics";
import { metricsWindowSchema, resolveMetricsWindow } from "./metrics-schemas";

const NOW = "2026-02-15T00:00:00.000Z";

const wrapperMocks = vi.hoisted(() => ({
  requireInternalOperator: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
  getFeedbackAggregateSummary: vi.fn(),
  createInternalOpsClient: vi.fn(),
}));

vi.mock("./access", () => ({
  requireInternalOperator: wrapperMocks.requireInternalOperator,
  recordSensitiveInternalAccess: wrapperMocks.recordSensitiveInternalAccess,
}));

vi.mock("@/features/feedback", () => ({
  getFeedbackAggregateSummary: wrapperMocks.getFeedbackAggregateSummary,
}));

vi.mock("@/lib/supabase/internal", () => ({
  createInternalOpsClient: wrapperMocks.createInternalOpsClient,
}));

function window(): ValidationMetricsWindow {
  return {
    mode: "custom",
    startDate: "2026-02-10",
    endDateExclusive: "2026-02-15",
    days: 5,
    timeZone: "Asia/Manila",
    startUtc: "2026-02-09T16:00:00.000Z",
    endUtc: "2026-02-14T16:00:00.000Z",
  };
}

function emptyFeedback() {
  return {
    asOf: NOW,
    window: {
      timeZone: "Asia/Manila" as const,
      startDate: "2026-02-10",
      endDateExclusive: "2026-02-15",
      days: 5,
    },
    snapshot: "CURRENT_STATUS" as const,
    retention: {
      policy: "UNAPPROVED" as const,
      coverage: "RETAINED_ROWS_ONLY" as const,
    },
    total: 0,
    byCategory: { BUG: 0, USABILITY: 0, FEATURE_REQUEST: 0, GENERAL: 0 },
    bySource: {
      PUBLIC_TRACKING: 0,
      PUBLIC_REQUEST: 0,
      PUBLIC_FEEDBACK: 0,
      PROVIDER_WORKSPACE: 0,
    },
    byStatus: { NEW: 0, REVIEWING: 0, PLANNED: 0, RESOLVED: 0, DISMISSED: 0 },
    daily: [] as Array<{ date: string; count: number }>,
  };
}

function row(
  dimension: string,
  bucket: string,
  rowCount = 1,
  intervalSeconds: number | null = null,
) {
  return {
    dimension,
    bucket,
    row_count: rowCount,
    interval_seconds: intervalSeconds,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("metrics period schema", () => {
  it("accepts fixed and custom periods", () => {
    expect(metricsWindowSchema.safeParse({ mode: "today" }).success).toBe(true);
    expect(metricsWindowSchema.safeParse({ mode: "7d" }).success).toBe(true);
    expect(metricsWindowSchema.safeParse({ mode: "30d" }).success).toBe(true);
    expect(
      metricsWindowSchema.safeParse({
        mode: "custom",
        startDate: "2026-01-31",
        endDateExclusive: "2026-02-01",
      }).success,
    ).toBe(true);
    expect(metricsWindowSchema.safeParse({ mode: "custom" }).success).toBe(
      false,
    );
    expect(metricsWindowSchema.safeParse({ mode: "year" }).success).toBe(false);
    expect(
      metricsWindowSchema.safeParse({
        mode: "custom",
        startDate: "2026-01-01T00:00:00Z",
        endDateExclusive: "2026-01-02",
      }).success,
    ).toBe(false);
  });

  it("resolves 7d as the trailing 7 Manila days including today", () => {
    vi.useFakeTimers();
    // 02:00 Manila on Feb 14 is still Feb 13 in UTC.
    vi.setSystemTime(new Date("2026-02-14T02:00:00+08:00"));
    expect(resolveMetricsWindow({ mode: "7d" })).toEqual({
      startDate: "2026-02-08",
      endDateExclusive: "2026-02-15",
    });
    expect(resolveMetricsWindow({ mode: "today" })).toEqual({
      startDate: "2026-02-14",
      endDateExclusive: "2026-02-15",
    });
    // The window start is the Manila midnight expressed as a UTC instant.
    expect(new Date("2026-02-08T00:00:00+08:00").toISOString()).toBe(
      "2026-02-07T16:00:00.000Z",
    );
  });

  it("rejects custom periods outside 1..90 Manila days", () => {
    expect(() =>
      resolveMetricsWindow({
        mode: "custom",
        startDate: "2026-01-31",
        endDateExclusive: "2026-01-31",
      }),
    ).toThrow();
    expect(() =>
      resolveMetricsWindow({
        mode: "custom",
        startDate: "2025-08-01",
        endDateExclusive: "2025-11-15",
      }),
    ).toThrow();
    expect(
      resolveMetricsWindow({
        mode: "custom",
        startDate: "2025-11-15",
        endDateExclusive: "2025-11-16",
      }),
    ).toEqual({ startDate: "2025-11-15", endDateExclusive: "2025-11-16" });
  });
});

describe("buildValidationMetrics", () => {
  const baseWindow = window();

  it("zero-fills absent groups and keeps empty-denominator ratios null", () => {
    const metrics = buildValidationMetrics(
      [],
      baseWindow,
      emptyFeedback(),
      NOW,
    );
    expect(metrics.providers.onboardedInPeriod).toEqual({
      shop: 0,
      independent: 0,
      total: 0,
    });
    expect(metrics.providers.allTime).toEqual({
      shop: 0,
      independent: 0,
      total: 0,
    });
    expect(metrics.activity.daily).toEqual([]);
    expect(metrics.repairs.statusNow).toEqual({
      IN_PROGRESS: 0,
      WAITING_FOR_PARTS: 0,
      AWAITING_APPROVAL: 0,
      READY: 0,
      COMPLETED: 0,
    });
    expect(metrics.requests.conversionPercent).toBeNull();
    expect(metrics.requests.meanDecisionSeconds).toBeNull();
    expect(metrics.tracking.adoptionPercent).toBeNull();
  });

  it("projects exact counts, splits, sorted days and percent ratios", () => {
    const metrics = buildValidationMetrics(
      [
        row("PROVIDER_ONBOARDED_IN_PERIOD", "SHOP", 2),
        row("PROVIDER_ONBOARDED_IN_PERIOD", "INDEPENDENT", 1),
        row("PROVIDER_ONBOARDED_ALL_TIME", "SHOP", 5),
        row("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT", 3),
        row("ACTIVE_PROVIDER_IN_PERIOD", "TOTAL", 4),
        row("ACTIVE_PROVIDER_IN_PERIOD", "REPEAT", 1),
        row("ACTIVE_DAY", "2026-02-12", 2),
        row("ACTIVE_DAY", "2026-02-11", 3),
        row("STAFF_MEMBERSHIP_ACTIVE", "TOTAL", 2),
        row("SHOP_WITH_STAFF", "TOTAL", 1),
        row("REPAIR_STATUS_NOW", "COMPLETED", 6),
        row("REPAIR_STATUS_NOW", "IN_PROGRESS", 2),
        row("REPAIR_CREATED_IN_PERIOD", "CUSTOMER_REQUEST", 3),
        row("REPAIR_CREATED_IN_PERIOD", "PROVIDER_CREATED", 1),
        row("REPAIR_COMPLETED_IN_PERIOD", "TOTAL", 2),
        row("READY_REACHED_IN_PERIOD", "TOTAL", 2),
        row("STATUS_MAINTAINED_IN_PERIOD", "TOTAL", 1),
        row("REQUEST_RECEIVED_IN_PERIOD", "TOTAL", 3),
        row("REQUEST_DECIDED_IN_PERIOD", "TOTAL", 2),
        row("REQUEST_DECIDED_IN_PERIOD", "ACCEPTED", 1),
        row("REQUEST_DECIDED_IN_PERIOD", "DECLINED", 1),
        row("REQUEST_PENDING_NOW", "TOTAL", 1),
        row("REQUEST_COHORT_IN_PERIOD", "RECEIVED", 3),
        row("REQUEST_COHORT_IN_PERIOD", "ACCEPTED", 1),
        row("REQUEST_DECISION_SECONDS", "MEAN", 2, 4.5),
        row("TRACKING_VIEWS_IN_PERIOD", "TOTAL", 7),
        row("TRACKING_VIEWS_IN_PERIOD", "REPAIRS", 3),
        row("TRACKING_ALL_TIME", "TOTAL", 9),
        row("TRACKING_ALL_TIME", "REPAIRS", 2),
        row("REPAIR_ALL_TIME", "TOTAL", 3),
      ],
      baseWindow,
      emptyFeedback(),
      NOW,
    );

    expect(metrics.providers.onboardedInPeriod).toEqual({
      shop: 2,
      independent: 1,
      total: 3,
    });
    expect(metrics.providers.allTime).toEqual({
      shop: 5,
      independent: 3,
      total: 8,
    });
    expect(metrics.activity).toEqual({
      distinctProviders: 4,
      repeatProviders: 1,
      daily: [
        { date: "2026-02-11", distinctProviders: 3 },
        { date: "2026-02-12", distinctProviders: 2 },
      ],
    });
    expect(metrics.repairs.created).toEqual({
      total: 4,
      customerRequest: 3,
      providerCreated: 1,
    });
    expect(metrics.requests.conversionPercent).toBe(33);
    expect(metrics.requests.meanDecisionSeconds).toBe(4.5);
    expect(metrics.tracking.adoptionPercent).toBe(67);
    expect(metrics.tracking.periodRepairsViewed).toBe(3);
  });

  it("rejects malformed RPC rows at the interface boundary", () => {
    expect(
      metricsRowSchema.safeParse({
        dimension: "X",
        bucket: "Y",
        row_count: "3",
        interval_seconds: null,
      }).success,
    ).toBe(true);
    expect(
      metricsRowSchema.safeParse({
        dimension: "X",
        bucket: null,
        row_count: 3,
        interval_seconds: null,
      }).success,
    ).toBe(false);
    expect(
      metricsRowSchema.safeParse({
        dimension: "X",
        bucket: "Y",
        row_count: -1,
      }),
    ).toMatchObject({ success: false });
  });
});

describe("getValidationMetrics guard and interface", () => {
  beforeEach(() => {
    wrapperMocks.requireInternalOperator.mockReset();
    wrapperMocks.recordSensitiveInternalAccess.mockReset();
    wrapperMocks.getFeedbackAggregateSummary.mockReset();
    wrapperMocks.createInternalOpsClient.mockReset();
  });

  function stubHappyRpc() {
    wrapperMocks.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "/operator-id",
    });
    wrapperMocks.recordSensitiveInternalAccess.mockResolvedValue(true);
    wrapperMocks.getFeedbackAggregateSummary.mockResolvedValue(emptyFeedback());
    wrapperMocks.createInternalOpsClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            dimension: "PROVIDER_ONBOARDED_IN_PERIOD",
            bucket: "SHOP",
            row_count: "2",
            interval_seconds: null,
          },
        ],
        error: null,
      }),
    });
  }

  it("maps a non-ALLOWED guard outcome to FORBIDDEN", async () => {
    wrapperMocks.requireInternalOperator.mockResolvedValue({
      status: "FORBIDDEN",
    });
    await expect(getValidationMetrics({ mode: "today" })).rejects.toMatchObject(
      {
        name: "MetricsError",
        code: "FORBIDDEN",
      },
    );
    expect(wrapperMocks.createInternalOpsClient).not.toHaveBeenCalled();
  });

  it("queries nothing before the access audit succeeds", async () => {
    wrapperMocks.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-id",
    });
    wrapperMocks.recordSensitiveInternalAccess.mockResolvedValue(false);
    await expect(getValidationMetrics({ mode: "today" })).rejects.toMatchObject(
      {
        name: "MetricsError",
        code: "UNAVAILABLE",
      },
    );
    expect(wrapperMocks.createInternalOpsClient).not.toHaveBeenCalled();
  });

  it("guards, audits, reads the RPC rows and carries Feedback through", async () => {
    stubHappyRpc();
    const metrics = await getValidationMetrics({ mode: "today" });

    expect(wrapperMocks.recordSensitiveInternalAccess).toHaveBeenCalledWith(
      "INTERNAL_ACCESS_VIEW",
    );
    expect(wrapperMocks.getFeedbackAggregateSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        endDateExclusive: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(metrics.providers.onboardedInPeriod).toEqual({
      shop: 2,
      independent: 0,
      total: 2,
    });
    expect(metrics.window.timeZone).toBe("Asia/Manila");
    expect(
      Date.parse(metrics.window.endUtc) - Date.parse(metrics.window.startUtc),
    ).toBe(86_400_000);
    expect(metrics.feedback).toEqual(emptyFeedback());
  });

  it("maps a failed RPC result to UNAVAILABLE", async () => {
    wrapperMocks.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-id",
    });
    wrapperMocks.recordSensitiveInternalAccess.mockResolvedValue(true);
    wrapperMocks.getFeedbackAggregateSummary.mockResolvedValue(emptyFeedback());
    wrapperMocks.createInternalOpsClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "40301", message: "denied" },
      }),
    });
    await expect(getValidationMetrics({ mode: "7d" })).rejects.toMatchObject({
      name: "MetricsError",
      code: "UNAVAILABLE",
    });
  });
});
