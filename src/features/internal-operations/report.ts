import "server-only";

import type { ValidationMetrics } from "./metrics";

/**
 * Privacy-safe, count-only report rows for the validation exports. No Provider,
 * Customer or feedback identifiers and no feedback bodies are ever included.
 */
export const MIN_COHORT = 5;

export type ReportUnit = "count" | "percent" | "seconds";

export interface ReportRow {
  section: string;
  metric: string;
  bucket: string | null;
  value: number | null;
  unit: ReportUnit;
  suppressed: boolean;
}

export interface ValidationReport {
  generatedAt: string;
  asOf: string;
  revision: string | null;
  source: "INTERNAL_VALIDATION_METRICS";
  window: ValidationMetrics["window"];
  coverage: ValidationMetrics["coverage"];
  glossary: typeof REPORT_GLOSSARY;
  suppression: { minimumGroup: number; applied: boolean };
  notes: string[];
  rows: ReportRow[];
}

/** Metric glossary shipped with every export so a reader can interpret it. */
export const REPORT_GLOSSARY = [
  {
    term: "Providers onboarded",
    definition:
      "Providers created inside the period, split SHOP / INDEPENDENT, plus the all-time split.",
  },
  {
    term: "Providers doing real work",
    definition:
      "Distinct Providers with at least one Repair creation, Request decision, non-initial status change or Customer Update in the period. REPEAT means active on 2+ Manila days.",
  },
  {
    term: "Repairs",
    definition:
      "Created (total and by origin), completed, READY reached and status maintained in the period. Status-now is a snapshot.",
  },
  {
    term: "Requests",
    definition:
      "Received inside the window; decisions made inside the window (accepted / declined); pending-now snapshot. Conversion uses the submission cohort, independent of when the decision landed.",
  },
  {
    term: "Tracking",
    definition:
      "Successful views and distinct repairs viewed in the period and all-time; adoption is all-time viewed repairs over all-time Repairs.",
  },
  {
    term: "Feedback",
    definition:
      "Count-only totals by category, source and status through the Feedback summary; unavailable feedback is N/A, never zero.",
  },
] as const;

type Cell = {
  key: string;
  row: ReportRow;
  group?: string;
  dependsOn?: string[];
};

const REPAIR_STATUSES = [
  "IN_PROGRESS",
  "WAITING_FOR_PARTS",
  "AWAITING_APPROVAL",
  "READY",
  "COMPLETED",
] as const;

const FEEDBACK_CATEGORIES = [
  "BUG",
  "USABILITY",
  "FEATURE_REQUEST",
  "GENERAL",
] as const;

const FEEDBACK_SOURCES = [
  "PUBLIC_TRACKING",
  "PUBLIC_REQUEST",
  "PUBLIC_FEEDBACK",
  "PROVIDER_WORKSPACE",
] as const;

const FEEDBACK_STATUSES = [
  "NEW",
  "REVIEWING",
  "PLANNED",
  "RESOLVED",
  "DISMISSED",
] as const;

function count(
  key: string,
  section: string,
  metric: string,
  value: number,
  bucket: string | null = null,
  group?: string,
): Cell {
  return {
    key,
    group,
    row: { section, metric, bucket, value, unit: "count", suppressed: false },
  };
}

function derived(
  key: string,
  section: string,
  metric: string,
  value: number | null,
  unit: Exclude<ReportUnit, "count">,
  dependsOn: string[],
): Cell {
  return {
    key,
    dependsOn,
    row: { section, metric, bucket: null, value, unit, suppressed: false },
  };
}

function isSmall(value: number | null): boolean {
  return value !== null && value > 0 && value < MIN_COHORT;
}

// A part that is suppressed also hides its total, otherwise the part is
// derivable by subtraction. Derived ratios follow their input counts.
function applySuppression(cells: Cell[]): void {
  const byKey = new Map(cells.map((cell) => [cell.key, cell]));

  for (const cell of cells) {
    if (cell.row.unit === "count") {
      cell.row.suppressed = isSmall(cell.row.value);
    }
  }

  for (const cell of cells) {
    if (!cell.group || cell.row.bucket !== "TOTAL") continue;
    const smallPart = cells.some(
      (other) =>
        other.group === cell.group &&
        other.row.bucket !== "TOTAL" &&
        other.row.suppressed,
    );
    if (smallPart) cell.row.suppressed = true;
  }

  for (const cell of cells) {
    if (!cell.dependsOn) continue;
    if (cell.dependsOn.some((key) => byKey.get(key)?.row.suppressed ?? false)) {
      cell.row.suppressed = true;
    }
  }

  for (const cell of cells) {
    // Suppressed values must not survive in the payload.
    if (cell.row.suppressed) cell.row.value = null;
  }
}

function reportRevision(): string | null {
  const raw =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.APP_REVISION?.trim() ||
    "";
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw : null;
}

export function buildValidationReport(
  metrics: ValidationMetrics,
): ValidationReport {
  const cells: Cell[] = [
    count(
      "PROVIDER_ONBOARDED_IN_PERIOD_SHOP",
      "providers",
      "onboarded_in_period",
      metrics.providers.onboardedInPeriod.shop,
      "SHOP",
      "providers.onboarded",
    ),
    count(
      "PROVIDER_ONBOARDED_IN_PERIOD_INDEPENDENT",
      "providers",
      "onboarded_in_period",
      metrics.providers.onboardedInPeriod.independent,
      "INDEPENDENT",
      "providers.onboarded",
    ),
    count(
      "PROVIDER_ONBOARDED_IN_PERIOD_TOTAL",
      "providers",
      "onboarded_in_period",
      metrics.providers.onboardedInPeriod.total,
      "TOTAL",
      "providers.onboarded",
    ),
    count(
      "PROVIDER_ONBOARDED_ALL_TIME_SHOP",
      "providers",
      "onboarded_all_time",
      metrics.providers.allTime.shop,
      "SHOP",
      "providers.allTime",
    ),
    count(
      "PROVIDER_ONBOARDED_ALL_TIME_INDEPENDENT",
      "providers",
      "onboarded_all_time",
      metrics.providers.allTime.independent,
      "INDEPENDENT",
      "providers.allTime",
    ),
    count(
      "PROVIDER_ONBOARDED_ALL_TIME_TOTAL",
      "providers",
      "onboarded_all_time",
      metrics.providers.allTime.total,
      "TOTAL",
      "providers.allTime",
    ),
    count(
      "ACTIVE_PROVIDERS",
      "activity",
      "distinct_providers",
      metrics.activity.distinctProviders,
    ),
    count(
      "REPEAT_PROVIDERS",
      "activity",
      "repeat_providers",
      metrics.activity.repeatProviders,
    ),
    count(
      "STAFF_MEMBERSHIPS",
      "staff",
      "active_memberships",
      metrics.staff.memberships,
    ),
    count(
      "SHOPS_WITH_STAFF",
      "staff",
      "shops_with_staff",
      metrics.staff.shopsWithStaff,
    ),
    count(
      "REPAIR_CREATED_TOTAL",
      "repairs",
      "created",
      metrics.repairs.created.total,
      "TOTAL",
      "repairs.created",
    ),
    count(
      "REPAIR_CREATED_CUSTOMER_REQUEST",
      "repairs",
      "created",
      metrics.repairs.created.customerRequest,
      "CUSTOMER_REQUEST",
      "repairs.created",
    ),
    count(
      "REPAIR_CREATED_PROVIDER_CREATED",
      "repairs",
      "created",
      metrics.repairs.created.providerCreated,
      "PROVIDER_CREATED",
      "repairs.created",
    ),
    count(
      "REPAIR_COMPLETED",
      "repairs",
      "completed",
      metrics.repairs.completed,
    ),
    count(
      "REPAIR_READY_REACHED",
      "repairs",
      "ready_reached",
      metrics.repairs.readyReached,
    ),
    count(
      "REPAIR_STATUS_MAINTAINED",
      "repairs",
      "status_maintained",
      metrics.repairs.statusMaintained,
    ),
    count(
      "REQUEST_RECEIVED",
      "requests",
      "received",
      metrics.requests.received,
    ),
    count(
      "REQUEST_DECIDED_TOTAL",
      "requests",
      "decided",
      metrics.requests.decided.total,
      "TOTAL",
      "requests.decided",
    ),
    count(
      "REQUEST_DECIDED_ACCEPTED",
      "requests",
      "decided",
      metrics.requests.decided.accepted,
      "ACCEPTED",
      "requests.decided",
    ),
    count(
      "REQUEST_DECIDED_DECLINED",
      "requests",
      "decided",
      metrics.requests.decided.declined,
      "DECLINED",
      "requests.decided",
    ),
    count(
      "REQUEST_PENDING_NOW",
      "requests",
      "pending_now",
      metrics.requests.pendingNow,
    ),
    count(
      "REQUEST_COHORT_ACCEPTED",
      "requests",
      "cohort_accepted",
      metrics.requests.cohortAccepted,
    ),
    derived(
      "REQUEST_CONVERSION_PERCENT",
      "requests",
      "conversion_percent",
      metrics.requests.conversionPercent,
      "percent",
      ["REQUEST_RECEIVED", "REQUEST_COHORT_ACCEPTED"],
    ),
    derived(
      "REQUEST_MEAN_DECISION_SECONDS",
      "requests",
      "mean_decision_seconds",
      metrics.requests.meanDecisionSeconds,
      "seconds",
      ["REQUEST_DECIDED_TOTAL"],
    ),
    count(
      "TRACKING_VIEWS_IN_PERIOD",
      "tracking",
      "period_views",
      metrics.tracking.periodViews,
    ),
    count(
      "TRACKING_REPAIRS_VIEWED_IN_PERIOD",
      "tracking",
      "period_repairs_viewed",
      metrics.tracking.periodRepairsViewed,
    ),
    count(
      "TRACKING_VIEWS_ALL_TIME",
      "tracking",
      "all_time_views",
      metrics.tracking.allTimeViews,
    ),
    count(
      "TRACKING_REPAIRS_VIEWED_ALL_TIME",
      "tracking",
      "all_time_repairs_viewed",
      metrics.tracking.allTimeRepairsViewed,
    ),
    count(
      "REPAIR_ALL_TIME",
      "tracking",
      "all_time_repairs",
      metrics.tracking.allTimeRepairs,
    ),
    derived(
      "TRACKING_ADOPTION_PERCENT",
      "tracking",
      "adoption_percent",
      metrics.tracking.adoptionPercent,
      "percent",
      ["TRACKING_REPAIRS_VIEWED_ALL_TIME", "REPAIR_ALL_TIME"],
    ),
  ];

  for (const status of REPAIR_STATUSES) {
    cells.push(
      count(
        `REPAIR_STATUS_${status}`,
        "repairs",
        "status_now",
        metrics.repairs.statusNow[status],
        status,
      ),
    );
  }

  for (const day of metrics.activity.daily) {
    cells.push(
      count(
        `ACTIVE_DAY_${day.date}`,
        "activity",
        "active_providers_per_day",
        day.distinctProviders,
        day.date,
      ),
    );
  }

  const feedback = metrics.feedback;
  if (feedback) {
    cells.push(
      count(
        "FEEDBACK_TOTAL",
        "feedback",
        "total",
        feedback.total,
        "TOTAL",
        "feedback",
      ),
    );
    for (const category of FEEDBACK_CATEGORIES) {
      cells.push(
        count(
          `FEEDBACK_CATEGORY_${category}`,
          "feedback",
          "by_category",
          feedback.byCategory[category],
          category,
          "feedback",
        ),
      );
    }
    for (const source of FEEDBACK_SOURCES) {
      cells.push(
        count(
          `FEEDBACK_SOURCE_${source}`,
          "feedback",
          "by_source",
          feedback.bySource[source],
          source,
          "feedback",
        ),
      );
    }
    for (const status of FEEDBACK_STATUSES) {
      cells.push(
        count(
          `FEEDBACK_STATUS_${status}`,
          "feedback",
          "by_status",
          feedback.byStatus[status],
          status,
          "feedback",
        ),
      );
    }
    for (const day of feedback.daily) {
      cells.push(
        count(
          `FEEDBACK_DAY_${day.date}`,
          "feedback",
          "per_day",
          day.count,
          day.date,
        ),
      );
    }
  }

  applySuppression(cells);

  const notes = [
    `Counts from 1 to ${MIN_COHORT - 1} are suppressed as "<${MIN_COHORT}".`,
    "A suppressed part also suppresses its total, so the part cannot be derived.",
    "Derived ratios are suppressed when an input count is suppressed.",
    "Zero counts are shown; missing Feedback data is N/A, never zero.",
    "No Provider, Customer, feedback or authentication identifiers are exported.",
  ];
  if (!feedback) {
    notes.push("Feedback counts are unavailable for this window.");
  }

  return {
    generatedAt: new Date().toISOString(),
    asOf: metrics.asOf,
    revision: reportRevision(),
    source: "INTERNAL_VALIDATION_METRICS",
    window: metrics.window,
    coverage: metrics.coverage,
    glossary: REPORT_GLOSSARY,
    suppression: {
      minimumGroup: MIN_COHORT,
      applied: cells.some((cell) => cell.row.suppressed),
    },
    notes,
    rows: cells.map((cell) => cell.row),
  };
}

const CSV_COLUMNS = [
  "section",
  "metric",
  "bucket",
  "value",
  "unit",
  "suppressed",
] as const;

// Neutralize spreadsheet formula injection and quote only when required.
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function validationReportToCsv(report: ValidationReport): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of report.rows) {
    lines.push(
      [
        row.section,
        row.metric,
        row.bucket ?? "",
        row.value === null ? "" : String(row.value),
        row.unit,
        String(row.suppressed),
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function validationReportToJson(report: ValidationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
