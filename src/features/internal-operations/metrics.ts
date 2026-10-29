import "server-only";

import {
  FeedbackError,
  getFeedbackAggregateSummary,
  type FeedbackCountSummary,
} from "@/features/feedback";
import { createInternalOpsClient } from "@/lib/supabase/internal";

import {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "./access";
import {
  manilaMidnightUtc,
  metricsWindowSchema,
  resolveMetricsWindow,
  type MetricsWindowInput,
} from "./metrics-schemas";
import { z } from "zod";

/**
 * Server-only aggregate validation metrics for internal operators. Every
 * number comes from the service-role-only fixed-column RPC; identifiers and
 * Provider series never enter the application, and ratios are computed here so
 * an empty denominator becomes null (rendered N/A) instead of zero.
 */

const DAY_MS = 86_400_000;

export class MetricsError extends Error {
  readonly code: "INVALID_INPUT" | "FORBIDDEN" | "UNAVAILABLE";

  constructor(
    message: string,
    code: "INVALID_INPUT" | "FORBIDDEN" | "UNAVAILABLE",
  ) {
    super(message);
    this.name = "MetricsError";
    this.code = code;
  }
}

export type ValidationMetricsWindow = {
  mode: MetricsWindowInput["mode"];
  startDate: string;
  endDateExclusive: string;
  days: number;
  timeZone: "Asia/Manila";
  startUtc: string;
  endUtc: string;
};

const REPAIR_STATUSES = [
  "IN_PROGRESS",
  "WAITING_FOR_PARTS",
  "AWAITING_APPROVAL",
  "READY",
  "COMPLETED",
] as const;

export type RepairStatusNow = Record<(typeof REPAIR_STATUSES)[number], number>;

export type MetricsCoverage = {
  domain: {
    source: "AUTHORITATIVE_DOMAIN_TABLES";
    coverage: "RETAINED_ROWS_ONLY";
    snapshot: "CURRENT_STATE";
    observedEndUtc: string;
  };
  feedback: {
    source: "FEEDBACK_MODULE";
    coverage: "RETAINED_ROWS_ONLY";
    status: "AVAILABLE" | "UNAVAILABLE";
    asOfStart: string | null;
    asOfEnd: string | null;
    batches: number;
  };
  retentionPolicy: "UNAPPROVED";
};

export type ValidationMetrics = {
  asOf: string;
  window: ValidationMetricsWindow;
  providers: {
    onboardedInPeriod: { shop: number; independent: number; total: number };
    allTime: { shop: number; independent: number; total: number };
  };
  activity: {
    distinctProviders: number;
    repeatProviders: number;
    daily: Array<{ date: string; distinctProviders: number }>;
  };
  staff: { memberships: number; shopsWithStaff: number };
  repairs: {
    statusNow: RepairStatusNow;
    created: {
      total: number;
      customerRequest: number;
      providerCreated: number;
    };
    completed: number;
    readyReached: number;
    statusMaintained: number;
  };
  requests: {
    received: number;
    decided: { total: number; accepted: number; declined: number };
    pendingNow: number;
    cohortAccepted: number;
    conversionPercent: number | null;
    meanDecisionSeconds: number | null;
  };
  tracking: {
    periodViews: number;
    periodRepairsViewed: number;
    allTimeViews: number;
    allTimeRepairsViewed: number;
    allTimeRepairs: number;
    adoptionPercent: number | null;
  };
  feedback: FeedbackCountSummary | null;
  coverage: MetricsCoverage;
};

const METRIC_BUCKETS: Record<string, readonly string[]> = {
  PROVIDER_ONBOARDED_IN_PERIOD: ["SHOP", "INDEPENDENT", "TOTAL"],
  PROVIDER_ONBOARDED_ALL_TIME: ["SHOP", "INDEPENDENT", "TOTAL"],
  ACTIVE_PROVIDER_IN_PERIOD: ["TOTAL", "REPEAT"],
  ACTIVE_DAY: [],
  STAFF_MEMBERSHIP_ACTIVE: ["TOTAL"],
  SHOP_WITH_STAFF: ["TOTAL"],
  REPAIR_STATUS_NOW: REPAIR_STATUSES,
  REPAIR_CREATED_IN_PERIOD: ["TOTAL", "CUSTOMER_REQUEST", "PROVIDER_CREATED"],
  REPAIR_COMPLETED_IN_PERIOD: ["TOTAL"],
  READY_REACHED_IN_PERIOD: ["TOTAL"],
  STATUS_MAINTAINED_IN_PERIOD: ["TOTAL"],
  REQUEST_RECEIVED_IN_PERIOD: ["TOTAL"],
  REQUEST_DECIDED_IN_PERIOD: ["TOTAL", "ACCEPTED", "DECLINED"],
  REQUEST_PENDING_NOW: ["TOTAL"],
  REQUEST_COHORT_IN_PERIOD: ["RECEIVED", "ACCEPTED"],
  REQUEST_DECISION_SECONDS: ["MEAN"],
  TRACKING_VIEWS_IN_PERIOD: ["TOTAL", "REPAIRS"],
  TRACKING_ALL_TIME: ["TOTAL", "REPAIRS"],
  REPAIR_ALL_TIME: ["TOTAL"],
};

const REQUIRED_GROUPS = [
  "PROVIDER_ONBOARDED_ALL_TIME/TOTAL",
  "ACTIVE_PROVIDER_IN_PERIOD/TOTAL",
  "ACTIVE_PROVIDER_IN_PERIOD/REPEAT",
  "STAFF_MEMBERSHIP_ACTIVE/TOTAL",
  "SHOP_WITH_STAFF/TOTAL",
  "REPAIR_CREATED_IN_PERIOD/TOTAL",
  "REPAIR_COMPLETED_IN_PERIOD/TOTAL",
  "READY_REACHED_IN_PERIOD/TOTAL",
  "STATUS_MAINTAINED_IN_PERIOD/TOTAL",
  "REQUEST_RECEIVED_IN_PERIOD/TOTAL",
  "REQUEST_DECIDED_IN_PERIOD/TOTAL",
  "REQUEST_DECIDED_IN_PERIOD/ACCEPTED",
  "REQUEST_DECIDED_IN_PERIOD/DECLINED",
  "REQUEST_PENDING_NOW/TOTAL",
  "REQUEST_COHORT_IN_PERIOD/RECEIVED",
  "REQUEST_COHORT_IN_PERIOD/ACCEPTED",
  "REQUEST_DECISION_SECONDS/MEAN",
  "TRACKING_VIEWS_IN_PERIOD/TOTAL",
  "TRACKING_VIEWS_IN_PERIOD/REPAIRS",
  "TRACKING_ALL_TIME/TOTAL",
  "TRACKING_ALL_TIME/REPAIRS",
  "REPAIR_ALL_TIME/TOTAL",
];

// PostgREST may encode BIGINT/NUMERIC as strings, but null/booleans are not counts.
const numeric = z
  .union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/)])
  .transform(Number);
export const metricsRowSchema = z
  .strictObject({
    dimension: z.string(),
    bucket: z.string(),
    row_count: numeric.pipe(
      z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    ),
    interval_seconds: numeric.pipe(z.number().nonnegative()).nullable(),
    as_of: z.iso.datetime({ offset: true }),
  })
  .superRefine((row, ctx) => {
    const allowed = METRIC_BUCKETS[row.dimension];
    if (
      !allowed ||
      (row.dimension === "ACTIVE_DAY"
        ? !z.iso.date().safeParse(row.bucket).success
        : !allowed.includes(row.bucket))
    ) {
      ctx.addIssue({ code: "custom", message: "Unknown metrics group" });
    }
    if (
      row.dimension !== "REQUEST_DECISION_SECONDS" &&
      row.interval_seconds !== null
    ) {
      ctx.addIssue({ code: "custom", message: "Unexpected interval value" });
    }
  });

export type MetricsRow = z.output<typeof metricsRowSchema>;

function countAt(
  rows: MetricsRow[],
  dimension: string,
  bucket: string,
): number {
  return (
    rows.find((row) => row.dimension === dimension && row.bucket === bucket)
      ?.row_count ?? 0
  );
}

function roundPercent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

/**
 * Projects fixed dimension/bucket/count groups into the typed metrics output.
 * Missing groups zero-fill; every ratio is null (N/A) on an empty denominator.
 */
export function buildValidationMetrics(
  rows: MetricsRow[],
  window: ValidationMetricsWindow,
  feedback: FeedbackCountSummary | null,
  asOf: string,
): ValidationMetrics {
  const onboarding = (
    dimension: string,
  ): { shop: number; independent: number; total: number } => {
    const byType = rows.filter((row) => row.dimension === dimension);
    const pick = (bucket: string) =>
      byType.find((row) => row.bucket === bucket)?.row_count ?? 0;
    const shop = pick("SHOP");
    const independent = pick("INDEPENDENT");
    const total = pick("TOTAL") || shop + independent;
    return { shop, independent, total };
  };

  const statusNow: RepairStatusNow = {
    IN_PROGRESS: 0,
    WAITING_FOR_PARTS: 0,
    AWAITING_APPROVAL: 0,
    READY: 0,
    COMPLETED: 0,
  };
  for (const status of REPAIR_STATUSES) {
    const row = rows.find(
      (r) => r.dimension === "REPAIR_STATUS_NOW" && r.bucket === status,
    );
    if (row) {
      statusNow[status] = row.row_count;
    }
  }

  const daily = Array.from({ length: window.days }, (_, day) => {
    const date = new Date(Date.parse(window.startDate) + day * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return { date, distinctProviders: countAt(rows, "ACTIVE_DAY", date) };
  });

  const periodViews = countAt(rows, "TRACKING_VIEWS_IN_PERIOD", "TOTAL");
  const allTimeViews = countAt(rows, "TRACKING_ALL_TIME", "TOTAL");
  const allTimeRepairsViewed = countAt(rows, "TRACKING_ALL_TIME", "REPAIRS");
  const allTimeRepairs = countAt(rows, "REPAIR_ALL_TIME", "TOTAL");
  const cohortAccepted = countAt(rows, "REQUEST_COHORT_IN_PERIOD", "ACCEPTED");
  const cohortReceived = countAt(rows, "REQUEST_COHORT_IN_PERIOD", "RECEIVED");
  const decisionRow = rows.find(
    (row) =>
      row.dimension === "REQUEST_DECISION_SECONDS" && row.bucket === "MEAN",
  );

  return {
    asOf,
    window,
    providers: {
      onboardedInPeriod: onboarding("PROVIDER_ONBOARDED_IN_PERIOD"),
      allTime: onboarding("PROVIDER_ONBOARDED_ALL_TIME"),
    },
    activity: {
      distinctProviders: countAt(rows, "ACTIVE_PROVIDER_IN_PERIOD", "TOTAL"),
      repeatProviders: countAt(rows, "ACTIVE_PROVIDER_IN_PERIOD", "REPEAT"),
      daily,
    },
    staff: {
      memberships: countAt(rows, "STAFF_MEMBERSHIP_ACTIVE", "TOTAL"),
      shopsWithStaff: countAt(rows, "SHOP_WITH_STAFF", "TOTAL"),
    },
    repairs: {
      statusNow,
      created: {
        total:
          countAt(rows, "REPAIR_CREATED_IN_PERIOD", "TOTAL") ||
          countAt(rows, "REPAIR_CREATED_IN_PERIOD", "CUSTOMER_REQUEST") +
            countAt(rows, "REPAIR_CREATED_IN_PERIOD", "PROVIDER_CREATED"),
        customerRequest: countAt(
          rows,
          "REPAIR_CREATED_IN_PERIOD",
          "CUSTOMER_REQUEST",
        ),
        providerCreated: countAt(
          rows,
          "REPAIR_CREATED_IN_PERIOD",
          "PROVIDER_CREATED",
        ),
      },
      completed: countAt(rows, "REPAIR_COMPLETED_IN_PERIOD", "TOTAL"),
      readyReached: countAt(rows, "READY_REACHED_IN_PERIOD", "TOTAL"),
      statusMaintained: countAt(rows, "STATUS_MAINTAINED_IN_PERIOD", "TOTAL"),
    },
    requests: {
      received: countAt(rows, "REQUEST_RECEIVED_IN_PERIOD", "TOTAL"),
      decided: {
        total: countAt(rows, "REQUEST_DECIDED_IN_PERIOD", "TOTAL"),
        accepted: countAt(rows, "REQUEST_DECIDED_IN_PERIOD", "ACCEPTED"),
        declined: countAt(rows, "REQUEST_DECIDED_IN_PERIOD", "DECLINED"),
      },
      pendingNow: countAt(rows, "REQUEST_PENDING_NOW", "TOTAL"),
      cohortAccepted,
      conversionPercent: roundPercent(cohortAccepted, cohortReceived),
      meanDecisionSeconds: decisionRow?.interval_seconds ?? null,
    },
    tracking: {
      periodViews,
      periodRepairsViewed: countAt(rows, "TRACKING_VIEWS_IN_PERIOD", "REPAIRS"),
      allTimeViews,
      allTimeRepairsViewed,
      allTimeRepairs,
      adoptionPercent: roundPercent(allTimeRepairsViewed, allTimeRepairs),
    },
    feedback,
    coverage: {
      domain: {
        source: "AUTHORITATIVE_DOMAIN_TABLES",
        coverage: "RETAINED_ROWS_ONLY",
        snapshot: "CURRENT_STATE",
        observedEndUtc: new Date(
          Math.min(Date.parse(window.endUtc), Date.parse(asOf)),
        ).toISOString(),
      },
      feedback: {
        source: "FEEDBACK_MODULE",
        coverage: "RETAINED_ROWS_ONLY",
        status: feedback ? "AVAILABLE" : "UNAVAILABLE",
        asOfStart: feedback?.asOf ?? null,
        asOfEnd: feedback?.asOf ?? null,
        batches: feedback ? 1 : 0,
      },
      retentionPolicy: "UNAPPROVED",
    },
  };
}

/**
 * Guarded, audited, count-only validation metrics for one bounded window.
 * Feedback counts come only through the Feedback summary interface.
 */
export async function getValidationMetrics(
  window: unknown,
): Promise<ValidationMetrics> {
  try {
    const access = await requireInternalOperator();
    if (access.status === "UNAVAILABLE") {
      throw new MetricsError(
        "Validation metrics are unavailable. Please try again.",
        "UNAVAILABLE",
      );
    }
    if (access.status !== "ALLOWED") {
      throw new MetricsError("Internal access is not available", "FORBIDDEN");
    }
    const parsed = metricsWindowSchema.safeParse(window);
    if (!parsed.success) {
      throw new MetricsError("Metrics period is invalid", "INVALID_INPUT");
    }
    let resolved;
    try {
      resolved = resolveMetricsWindow(parsed.data);
    } catch (error) {
      throw new MetricsError(
        error instanceof Error ? error.message : "Metrics period is invalid",
        "INVALID_INPUT",
      );
    }
    if (!(await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW"))) {
      throw new MetricsError(
        "Validation metrics are unavailable. Please try again.",
        "UNAVAILABLE",
      );
    }
    const period: ValidationMetricsWindow = {
      mode: parsed.data.mode,
      ...resolved,
      days:
        (Date.parse(resolved.endDateExclusive) -
          Date.parse(resolved.startDate)) /
        DAY_MS,
      timeZone: "Asia/Manila",
      startUtc: manilaMidnightUtc(resolved.startDate),
      endUtc: manilaMidnightUtc(resolved.endDateExclusive),
    };
    const rows = await readMetricRows(access.userId, period);
    const feedbackRead = await readFeedbackBatches(period);
    const metrics = buildValidationMetrics(
      rows,
      period,
      feedbackRead.summary,
      rows[0].as_of,
    );
    metrics.coverage.feedback = feedbackRead.coverage;
    return metrics;
  } catch (error) {
    if (error instanceof MetricsError) throw error;
    console.error("[METRICS_FAILURE] validation metrics operation unavailable");
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }
}

function sumCounts<Key extends string>(
  left: Record<Key, number>,
  right: Record<Key, number>,
): Record<Key, number> {
  const result = { ...left };
  for (const key in right) result[key] += right[key];
  return result;
}

// Feedback retains its existing 31-day query bound. Disjoint batches cover the
// report period; their separately generated current-status reads are labelled.
async function readFeedbackBatches(window: ValidationMetricsWindow): Promise<{
  summary: FeedbackCountSummary | null;
  coverage: MetricsCoverage["feedback"];
}> {
  const coverage: MetricsCoverage["feedback"] = {
    source: "FEEDBACK_MODULE",
    coverage: "RETAINED_ROWS_ONLY",
    status: "UNAVAILABLE",
    asOfStart: null,
    asOfEnd: null,
    batches: 0,
  };
  try {
    let summary: FeedbackCountSummary | null = null;
    for (
      let start = Date.parse(window.startDate);
      start < Date.parse(window.endDateExclusive);
      start += 31 * DAY_MS
    ) {
      const end = Math.min(
        start + 31 * DAY_MS,
        Date.parse(window.endDateExclusive),
      );
      const batch = await getFeedbackAggregateSummary({
        startDate: new Date(start).toISOString().slice(0, 10),
        endDateExclusive: new Date(end).toISOString().slice(0, 10),
      });
      if (summary === null) {
        summary = {
          ...batch,
          byCategory: { ...batch.byCategory },
          bySource: { ...batch.bySource },
          byStatus: { ...batch.byStatus },
          daily: [...batch.daily],
          window: {
            timeZone: "Asia/Manila",
            startDate: window.startDate,
            endDateExclusive: window.endDateExclusive,
            days: window.days,
          },
        };
        coverage.asOfStart = batch.asOf;
      } else {
        summary.total += batch.total;
        summary.byCategory = sumCounts(summary.byCategory, batch.byCategory);
        summary.bySource = sumCounts(summary.bySource, batch.bySource);
        summary.byStatus = sumCounts(summary.byStatus, batch.byStatus);
        summary.daily.push(...batch.daily);
        summary.asOf = batch.asOf;
      }
      coverage.asOfEnd = batch.asOf;
      coverage.batches++;
    }
    coverage.status = "AVAILABLE";
    return { summary, coverage };
  } catch (error) {
    if (error instanceof FeedbackError && error.code === "FORBIDDEN") {
      throw new MetricsError("Internal access is not available", "FORBIDDEN");
    }
    // Never return a partial-period count as a complete summary.
    console.error("[METRICS_FAILURE] feedback summary unavailable");
    return {
      summary: null,
      coverage: {
        ...coverage,
        status: "UNAVAILABLE",
        asOfStart: null,
        asOfEnd: null,
        batches: 0,
      },
    };
  }
}

async function readMetricRows(
  operatorUserId: string,
  window: ValidationMetricsWindow,
): Promise<MetricsRow[]> {
  const client = await createInternalOpsClient();
  const { data, error } = await client.rpc("get_internal_validation_metrics", {
    p_operator_user_id: operatorUserId,
    p_window_start: window.startUtc,
    p_window_end: window.endUtc,
  });
  if (error) {
    console.error("[METRICS_FAILURE] validation metrics RPC failed", {
      code:
        typeof error.code === "string" && /^[A-Z0-9]{5,8}$/.test(error.code)
          ? error.code
          : "unknown",
    });
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }
  const parsed = metricsRowSchema.array().safeParse(data);
  if (!parsed.success || parsed.data.length === 0) {
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }
  const rows = parsed.data;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.dimension + "/" + row.bucket;
    if (
      seen.has(key) ||
      row.as_of !== rows[0].as_of ||
      (row.dimension === "ACTIVE_DAY" &&
        (row.bucket < window.startDate ||
          row.bucket >= window.endDateExclusive))
    ) {
      throw new MetricsError(
        "Validation metrics are unavailable. Please try again.",
        "UNAVAILABLE",
      );
    }
    seen.add(key);
  }
  if (!REQUIRED_GROUPS.every((key) => seen.has(key))) {
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }
  return rows;
}
