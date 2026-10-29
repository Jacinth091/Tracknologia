import "server-only";

import {
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
  feedback: FeedbackCountSummary;
};

// BIGINT and NUMERIC columns arrive as strings through PostgREST.
export const metricsRowSchema = z.object({
  dimension: z.string(),
  bucket: z.string(),
  row_count: z.coerce.number().int().nonnegative(),
  interval_seconds: z.coerce.number().nonnegative().nullable(),
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
  feedback: FeedbackCountSummary,
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

  const daily = rows
    .filter((row) => row.dimension === "ACTIVE_DAY")
    .map((row) => ({ date: row.bucket, distinctProviders: row.row_count }))
    .sort((a, b) => a.date.localeCompare(b.date));

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
  };
}

/**
 * Guarded, audited, count-only validation metrics for one bounded window.
 * Feedback counts come only through the Feedback summary interface.
 */
export async function getValidationMetrics(
  window: unknown,
): Promise<ValidationMetrics> {
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
  } catch (err) {
    throw new MetricsError(
      err instanceof Error ? err.message : "Metrics period is invalid",
      "INVALID_INPUT",
    );
  }

  const audited = await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW");
  if (!audited) {
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }

  const startDate = resolved.startDate;
  const endDateExclusive = resolved.endDateExclusive;
  const feedback = await getFeedbackAggregateSummary({
    startDate,
    endDateExclusive,
  });

  const rows = await readMetricRows(access.userId, {
    start: manilaMidnightUtc(startDate),
    endExclusive: manilaMidnightUtc(endDateExclusive),
  });

  return buildValidationMetrics(
    rows,
    {
      mode: parsed.data.mode,
      startDate,
      endDateExclusive,
      days: Math.round(
        (Date.parse(endDateExclusive) - Date.parse(startDate)) / DAY_MS,
      ),
      timeZone: "Asia/Manila",
      startUtc: manilaMidnightUtc(startDate),
      endUtc: manilaMidnightUtc(endDateExclusive),
    },
    feedback,
    new Date().toISOString(),
  );
}

async function readMetricRows(
  operatorUserId: string,
  window: { start: string; endExclusive: string },
): Promise<MetricsRow[]> {
  const client = await createInternalOpsClient();
  const { data, error } = await client.rpc("get_internal_validation_metrics", {
    p_operator_user_id: operatorUserId,
    p_window_start: window.start,
    p_window_end: window.endExclusive,
  });

  if (error) {
    console.error("[METRICS_FAILURE] validation metrics RPC failed", {
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }

  const projected = metricsRowSchema.array().safeParse(data ?? []);
  if (!projected.success) {
    console.error("[METRICS_FAILURE] validation metrics rows are malformed", {
      timestamp: new Date().toISOString(),
    });
    throw new MetricsError(
      "Validation metrics are unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }
  return projected.data;
}
