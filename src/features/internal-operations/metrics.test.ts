import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildValidationMetrics,
  type ValidationMetricsWindow,
  metricsRowSchema,
  getValidationMetrics,
} from "./metrics";
import { metricsWindowSchema, resolveMetricsWindow } from "./metrics-schemas";

// Fixed clock: 2026-10-29 22:00 Manila, so past windows and "today" are stable.
const NOW = "2026-10-29T14:00:00.000Z";
// The domain snapshot time the RPC reports. It must reach the report unchanged.
const DOMAIN_AS_OF = "2026-10-29T13:55:00.000Z";
const OPERATOR_ID = "66845523-0521-4d82-9df8-4940c371e2b7";
const DAY_MS = 86_400_000;
const CANARY = "SECRET-CANARY-PAYLOAD";

// Trusted seams only: the operator guard, the audit, and the Supabase client.
// The Feedback module and the metrics wrapper run for real, so the 31-day
// Feedback limit and its validation are exercised rather than assumed.
const seams = vi.hoisted(() => ({
  requireInternalOperator: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/features/internal-operations/access", () => ({
  requireInternalOperator: seams.requireInternalOperator,
  recordSensitiveInternalAccess: seams.recordSensitiveInternalAccess,
}));

vi.mock("@/lib/supabase/internal", () => ({
  createInternalOpsClient: async () => ({ rpc: seams.rpc }),
}));

// Every group the domain RPC emits as a single aggregate row, even when zero.
// A response without one of these is incomplete and must not read as zeros.
const INVARIANT_GROUPS = [
  ["PROVIDER_ONBOARDED_ALL_TIME", "TOTAL"],
  ["ACTIVE_PROVIDER_IN_PERIOD", "TOTAL"],
  ["ACTIVE_PROVIDER_IN_PERIOD", "REPEAT"],
  ["STAFF_MEMBERSHIP_ACTIVE", "TOTAL"],
  ["SHOP_WITH_STAFF", "TOTAL"],
  ["REPAIR_CREATED_IN_PERIOD", "TOTAL"],
  ["REPAIR_COMPLETED_IN_PERIOD", "TOTAL"],
  ["READY_REACHED_IN_PERIOD", "TOTAL"],
  ["STATUS_MAINTAINED_IN_PERIOD", "TOTAL"],
  ["REQUEST_RECEIVED_IN_PERIOD", "TOTAL"],
  ["REQUEST_DECIDED_IN_PERIOD", "TOTAL"],
  ["REQUEST_DECIDED_IN_PERIOD", "ACCEPTED"],
  ["REQUEST_DECIDED_IN_PERIOD", "DECLINED"],
  ["REQUEST_PENDING_NOW", "TOTAL"],
  ["REQUEST_COHORT_IN_PERIOD", "RECEIVED"],
  ["REQUEST_COHORT_IN_PERIOD", "ACCEPTED"],
  ["REQUEST_DECISION_SECONDS", "MEAN"],
  ["TRACKING_VIEWS_IN_PERIOD", "TOTAL"],
  ["TRACKING_VIEWS_IN_PERIOD", "REPAIRS"],
  ["TRACKING_ALL_TIME", "TOTAL"],
  ["TRACKING_ALL_TIME", "REPAIRS"],
  ["REPAIR_ALL_TIME", "TOTAL"],
] as const;

type Override = {
  dimension: string;
  bucket: string;
  row_count?: number;
  interval_seconds?: number | null;
  as_of?: string;
};

// A complete RPC response: every invariant group at zero, then the overrides
// replace a matching group or add a sparse one. Sparse groups are not forced.
function completeRows(overrides: Override[] = [], asOf = DOMAIN_AS_OF) {
  const rows: Array<Record<string, unknown>> = INVARIANT_GROUPS.map(
    ([dimension, bucket]) => ({
      dimension,
      bucket,
      row_count: 0,
      interval_seconds: null,
      as_of: asOf,
    }),
  );
  for (const override of overrides) {
    const index = rows.findIndex(
      (row) =>
        row.dimension === override.dimension && row.bucket === override.bucket,
    );
    const next = {
      row_count: 0,
      interval_seconds: null,
      as_of: asOf,
      ...override,
    };
    if (index >= 0) {
      rows[index] = next;
    } else {
      rows.push(next);
    }
  }
  return rows;
}

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
    as_of: DOMAIN_AS_OF,
  };
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function feedbackCalls() {
  return seams.rpc.mock.calls
    .filter(([name]) => name === "get_feedback_count_summary")
    .map(
      ([, args]) =>
        args as { p_window_start: string; p_window_end: string },
    );
}

function domainCalls() {
  return seams.rpc.mock.calls.filter(
    ([name]) => name === "get_internal_validation_metrics",
  );
}

// Default RPC behavior: a complete, empty domain response and an empty Feedback
// summary for every batch. Tests override one call at a time.
function defaultRpc(name: string) {
  if (name === "get_feedback_count_summary") {
    return Promise.resolve({ data: [], error: null });
  }
  return Promise.resolve({ data: completeRows(), error: null });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  seams.requireInternalOperator.mockReset();
  seams.recordSensitiveInternalAccess.mockReset();
  seams.rpc.mockReset();
  seams.requireInternalOperator.mockResolvedValue({
    status: "ALLOWED",
    userId: OPERATOR_ID,
  });
  seams.recordSensitiveInternalAccess.mockResolvedValue(true);
  seams.rpc.mockImplementation(defaultRpc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it("rejects unknown keys on custom periods", () => {
    expect(
      metricsWindowSchema.safeParse({
        mode: "custom",
        startDate: "2026-01-31",
        endDateExclusive: "2026-02-01",
        extra: true,
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

  it("validates the strict RPC row shape at the interface boundary", () => {
    expect(
      metricsRowSchema.safeParse({
        dimension: "REPAIR_ALL_TIME",
        bucket: "TOTAL",
        row_count: "3",
        interval_seconds: null,
        as_of: DOMAIN_AS_OF,
      }).success,
    ).toBe(true);
    expect(
      metricsRowSchema.safeParse({
        dimension: "REPAIR_ALL_TIME",
        bucket: null,
        row_count: 3,
        interval_seconds: null,
        as_of: DOMAIN_AS_OF,
      }).success,
    ).toBe(false);
    expect(
      metricsRowSchema.safeParse({
        dimension: "REPAIR_ALL_TIME",
        bucket: "TOTAL",
        row_count: -1,
        interval_seconds: null,
        as_of: DOMAIN_AS_OF,
      }).success,
    ).toBe(false);
    // The as_of timestamp is required on every row.
    expect(
      metricsRowSchema.safeParse({
        dimension: "REPAIR_ALL_TIME",
        bucket: "TOTAL",
        row_count: 3,
        interval_seconds: null,
      }).success,
    ).toBe(false);
    expect(
      metricsRowSchema.safeParse({
        dimension: "REPAIR_ALL_TIME",
        bucket: "TOTAL",
        row_count: 3,
        interval_seconds: null,
        as_of: "not-a-timestamp",
      }).success,
    ).toBe(false);
    // Dimensions outside the fixed allowlist are rejected.
    expect(
      metricsRowSchema.safeParse({
        dimension: "PROVIDER_EMAIL_LIST",
        bucket: "TOTAL",
        row_count: 3,
        interval_seconds: null,
        as_of: DOMAIN_AS_OF,
      }).success,
    ).toBe(false);
  });
});

describe("getValidationMetrics guard and interface", () => {
  it("maps a non-ALLOWED guard outcome to FORBIDDEN", async () => {
    seams.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });
    await expect(getValidationMetrics({ mode: "today" })).rejects.toMatchObject(
      {
        name: "MetricsError",
        code: "FORBIDDEN",
      },
    );
    expect(seams.rpc).not.toHaveBeenCalled();
  });

  it("queries nothing before the access audit succeeds", async () => {
    seams.recordSensitiveInternalAccess.mockResolvedValue(false);
    await expect(getValidationMetrics({ mode: "today" })).rejects.toMatchObject(
      {
        name: "MetricsError",
        code: "UNAVAILABLE",
      },
    );
    expect(seams.rpc).not.toHaveBeenCalled();
  });

  it("guards, audits, reads complete domain rows and carries Feedback through", async () => {
    seams.rpc.mockImplementation(async (name: string) => {
      if (name === "get_feedback_count_summary") {
        return { data: [], error: null };
      }
      return {
        data: completeRows([
          {
            dimension: "PROVIDER_ONBOARDED_IN_PERIOD",
            bucket: "SHOP",
            row_count: 2,
          },
        ]),
        error: null,
      };
    });

    const metrics = await getValidationMetrics({
      mode: "custom",
      startDate: "2026-10-19",
      endDateExclusive: "2026-10-22",
    });

    expect(seams.recordSensitiveInternalAccess).toHaveBeenCalledWith(
      "INTERNAL_ACCESS_VIEW",
    );
    // The domain RPC keeps its three arguments and the Manila-midnight window.
    expect(domainCalls()).toEqual([
      [
        "get_internal_validation_metrics",
        {
          p_operator_user_id: OPERATOR_ID,
          p_window_start: "2026-10-18T16:00:00.000Z",
          p_window_end: "2026-10-21T16:00:00.000Z",
        },
      ],
    ]);
    expect(metrics.providers.onboardedInPeriod).toEqual({
      shop: 2,
      independent: 0,
      total: 2,
    });
    expect(metrics.window).toMatchObject({
      timeZone: "Asia/Manila",
      days: 3,
    });
    expect(
      Date.parse(metrics.window.endUtc) - Date.parse(metrics.window.startUtc),
    ).toBe(3 * DAY_MS);
    expect(metrics.feedback).toMatchObject({
      total: 0,
      window: { startDate: "2026-10-19", endDateExclusive: "2026-10-22" },
    });
    expect(metrics.coverage.feedback).toMatchObject({
      source: "FEEDBACK_MODULE",
      coverage: "RETAINED_ROWS_ONLY",
      status: "AVAILABLE",
      batches: 1,
    });
    expect(metrics.coverage.retentionPolicy).toBe("UNAPPROVED");
  });

  it("takes the report time from the domain RPC as_of, not the wall clock", async () => {
    const metrics = await getValidationMetrics({ mode: "today" });

    expect(metrics.asOf).toBe(DOMAIN_AS_OF);
    expect(metrics.asOf).not.toBe(NOW);
    expect(metrics.coverage.domain).toMatchObject({
      source: "AUTHORITATIVE_DOMAIN_TABLES",
      coverage: "RETAINED_ROWS_ONLY",
      snapshot: "CURRENT_STATE",
    });
    expect(typeof metrics.coverage.domain.observedEndUtc).toBe("string");
  });

  it("splits a 90-day span into 31, 31 and 28-day Feedback batches without overlap", async () => {
    const metrics = await getValidationMetrics({
      mode: "custom",
      startDate: "2026-07-01",
      endDateExclusive: "2026-09-29",
    });

    const calls = feedbackCalls();
    expect(calls).toHaveLength(3);
    expect(
      calls.map(
        (call) =>
          (Date.parse(call.p_window_end) - Date.parse(call.p_window_start)) /
          DAY_MS,
      ),
    ).toEqual([31, 31, 28]);
    // Each batch starts where the previous one ends: no gap, no overlap.
    expect(calls[0]?.p_window_start).toBe("2026-06-30T16:00:00.000Z");
    expect(calls[0]?.p_window_end).toBe(calls[1]?.p_window_start);
    expect(calls[1]?.p_window_end).toBe(calls[2]?.p_window_start);
    expect(calls[2]?.p_window_end).toBe("2026-09-28T16:00:00.000Z");

    // The composed report covers the full requested calendar window.
    expect(metrics.feedback).toMatchObject({
      window: { startDate: "2026-07-01", endDateExclusive: "2026-09-29", days: 90 },
    });
    expect(metrics.feedback?.daily).toHaveLength(90);
    expect(metrics.coverage.feedback).toMatchObject({
      status: "AVAILABLE",
      batches: 3,
    });
    expect(metrics.coverage.feedback.asOfStart).toEqual(expect.any(String));
    expect(metrics.coverage.feedback.asOfEnd).toEqual(expect.any(String));
  });

  it.each([
    [31, [31]],
    [32, [31, 1]],
    [62, [31, 31]],
  ])(
    "never sends Feedback more than 31 days per query for a %i-day span",
    async (days, expectedBatches) => {
      const startDate = "2026-07-01";
      await getValidationMetrics({
        mode: "custom",
        startDate,
        endDateExclusive: addDays(startDate, days),
      });

      const spans = feedbackCalls().map(
        (call) =>
          (Date.parse(call.p_window_end) - Date.parse(call.p_window_start)) /
          DAY_MS,
      );
      expect(spans).toEqual(expectedBatches);
      expect(Math.max(...spans)).toBeLessThanOrEqual(31);
    },
  );

  it.each([
    [
      "a window entirely in the future",
      { startDate: "2099-01-01", endDateExclusive: "2099-01-02" },
    ],
    [
      "an end beyond the next Manila midnight",
      { startDate: "2026-10-29", endDateExclusive: "2026-10-31" },
    ],
  ])(
    "rejects %s as INVALID_INPUT before any domain or Feedback query",
    async (_label, period) => {
      await expect(
        getValidationMetrics({ mode: "custom", ...period }),
      ).rejects.toMatchObject({ name: "MetricsError", code: "INVALID_INPUT" });
      expect(seams.rpc).not.toHaveBeenCalled();
    },
  );

  it("denies the whole report when Feedback reports FORBIDDEN", async () => {
    seams.requireInternalOperator
      .mockResolvedValueOnce({ status: "ALLOWED", userId: OPERATOR_ID })
      .mockResolvedValueOnce({ status: "FORBIDDEN" });

    await expect(getValidationMetrics({ mode: "today" })).rejects.toMatchObject({
      name: "MetricsError",
      code: "FORBIDDEN",
    });
  });

  it("keeps available domain counts when Feedback data is unavailable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    seams.rpc.mockImplementation(async (name: string) => {
      if (name === "get_feedback_count_summary") {
        return { data: null, error: { code: "XX000", message: CANARY } };
      }
      return {
        data: completeRows([
          {
            dimension: "PROVIDER_ONBOARDED_IN_PERIOD",
            bucket: "SHOP",
            row_count: 2,
          },
        ]),
        error: null,
      };
    });

    const metrics = await getValidationMetrics({
      mode: "custom",
      startDate: "2026-10-19",
      endDateExclusive: "2026-10-22",
    });

    expect(metrics.feedback).toBeNull();
    expect(metrics.coverage.feedback).toMatchObject({
      status: "UNAVAILABLE",
      asOfStart: null,
      asOfEnd: null,
    });
    expect(metrics.providers.onboardedInPeriod.shop).toBe(2);
    // Neither the response nor the logs carry the raw Feedback payload message.
    expect(JSON.stringify(metrics)).not.toContain(CANARY);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(CANARY);
  });

  it("maps a failed domain RPC result to UNAVAILABLE without leaking its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    seams.rpc.mockImplementation(async (name: string) => {
      if (name === "get_feedback_count_summary") {
        return { data: [], error: null };
      }
      return { data: null, error: { code: "40301", message: CANARY } };
    });

    const failure = await getValidationMetrics({ mode: "7d" }).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ name: "MetricsError", code: "UNAVAILABLE" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(CANARY);
  });

  it.each([
    ["a null result with no error", () => ({ data: null, error: null })],
    ["an empty row list", () => ({ data: [], error: null })],
    [
      "a non-array object",
      () => ({ data: { dimension: "REPAIR_ALL_TIME" }, error: null }),
    ],
    [
      "a dimension outside the allowlist",
      () => ({
        data: completeRows([
          { dimension: "UNLISTED_GROUP", bucket: "TOTAL", row_count: 1 },
        ]),
        error: null,
      }),
    ],
    [
      "rows missing as_of",
      () => ({
        data: completeRows().map(({ as_of: _asOf, ...rest }) => rest),
        error: null,
      }),
    ],
    [
      "rows with mixed as_of values",
      () => ({
        data: completeRows([
          {
            dimension: "REPAIR_ALL_TIME",
            bucket: "TOTAL",
            row_count: 0,
            as_of: "2026-10-29T13:00:00.000Z",
          },
        ]),
        error: null,
      }),
    ],
    [
      "a duplicate aggregate group",
      () => ({
        data: [
          ...completeRows(),
          {
            dimension: "REPAIR_ALL_TIME",
            bucket: "TOTAL",
            row_count: 0,
            interval_seconds: null,
            as_of: DOMAIN_AS_OF,
          },
        ],
        error: null,
      }),
    ],
    [
      "a missing invariant aggregate group",
      () => ({
        data: completeRows().filter(
          (r) => !(r.dimension === "REPAIR_ALL_TIME"),
        ),
        error: null,
      }),
    ],
    [
      "a negative count",
      () => ({
        data: completeRows([
          { dimension: "REPAIR_ALL_TIME", bucket: "TOTAL", row_count: -1 },
        ]),
        error: null,
      }),
    ],
  ])(
    "rejects %s from the domain RPC as UNAVAILABLE instead of zeros",
    async (_label, respond) => {
      seams.rpc.mockImplementation(async (name: string) => {
        if (name === "get_feedback_count_summary") {
          return { data: [], error: null };
        }
        return respond();
      });

      await expect(
        getValidationMetrics({ mode: "7d" }),
      ).rejects.toMatchObject({ name: "MetricsError", code: "UNAVAILABLE" });
    },
  );

  it("zero-fills ACTIVE_DAY for every requested calendar day", async () => {
    seams.rpc.mockImplementation(async (name: string) => {
      if (name === "get_feedback_count_summary") {
        return { data: [], error: null };
      }
      return {
        data: completeRows([
          { dimension: "ACTIVE_DAY", bucket: "2026-10-20", row_count: 2 },
        ]),
        error: null,
      };
    });

    const metrics = await getValidationMetrics({
      mode: "custom",
      startDate: "2026-10-19",
      endDateExclusive: "2026-10-22",
    });

    expect(metrics.activity.daily).toEqual([
      { date: "2026-10-19", distinctProviders: 0 },
      { date: "2026-10-20", distinctProviders: 2 },
      { date: "2026-10-21", distinctProviders: 0 },
    ]);
  });
});
