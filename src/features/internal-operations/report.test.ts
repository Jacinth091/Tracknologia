import { describe, expect, it, afterEach } from "vitest";

import type { FeedbackCountSummary } from "@/features/feedback";
import {
  buildValidationReport,
  MIN_COHORT,
  validationReportToCsv,
  validationReportToJson,
  type ReportRow,
} from "./report";
import type { ValidationMetrics, ValidationMetricsWindow } from "./metrics";

const WINDOW: ValidationMetricsWindow = {
  mode: "7d",
  startDate: "2026-10-23",
  endDateExclusive: "2026-10-30",
  days: 7,
  timeZone: "Asia/Manila",
  startUtc: "2026-10-22T16:00:00.000Z",
  endUtc: "2026-10-29T16:00:00.000Z",
};

function feedback(overrides: Partial<FeedbackCountSummary> = {}) {
  return {
    asOf: "2026-10-29T13:55:00.000Z",
    window: {
      timeZone: "Asia/Manila",
      startDate: "2026-10-23",
      endDateExclusive: "2026-10-30",
      days: 7,
    },
    snapshot: "CURRENT_STATUS",
    retention: { policy: "APPROVED", coverage: "RETAINED_ROWS_ONLY" },
    total: 12,
    byCategory: { BUG: 3, USABILITY: 4, FEATURE_REQUEST: 2, GENERAL: 3 },
    bySource: {
      PUBLIC_TRACKING: 3,
      PUBLIC_REQUEST: 3,
      PUBLIC_FEEDBACK: 3,
      PROVIDER_WORKSPACE: 3,
    },
    byStatus: { NEW: 5, REVIEWING: 3, PLANNED: 2, RESOLVED: 1, DISMISSED: 1 },
    daily: [{ date: "2026-10-27", count: 2 }],
    ...overrides,
  } satisfies FeedbackCountSummary;
}

function metrics(
  overrides: Partial<ValidationMetrics> = {},
): ValidationMetrics {
  return {
    asOf: "2026-10-29T13:55:00.000Z",
    window: WINDOW,
    providers: {
      onboardedInPeriod: { shop: 2, independent: 8, total: 10 },
      allTime: { shop: 12, independent: 9, total: 21 },
    },
    activity: {
      distinctProviders: 7,
      repeatProviders: 3,
      daily: [
        { date: "2026-10-23", distinctProviders: 6 },
        { date: "2026-10-24", distinctProviders: 2 },
      ],
    },
    staff: { memberships: 6, shopsWithStaff: 4 },
    repairs: {
      statusNow: {
        IN_PROGRESS: 5,
        WAITING_FOR_PARTS: 2,
        AWAITING_APPROVAL: 0,
        READY: 6,
        COMPLETED: 9,
      },
      created: { total: 11, customerRequest: 7, providerCreated: 4 },
      completed: 8,
      readyReached: 9,
      statusMaintained: 10,
    },
    requests: {
      received: 12,
      decided: { total: 9, accepted: 7, declined: 2 },
      pendingNow: 3,
      cohortAccepted: 8,
      conversionPercent: 67,
      meanDecisionSeconds: 540,
    },
    tracking: {
      periodViews: 30,
      periodRepairsViewed: 8,
      allTimeViews: 90,
      allTimeRepairsViewed: 20,
      allTimeRepairs: 25,
      adoptionPercent: 80,
    },
    feedback: feedback(),
    coverage: {
      domain: {
        source: "AUTHORITATIVE_DOMAIN_TABLES",
        coverage: "RETAINED_ROWS_ONLY",
        snapshot: "CURRENT_STATE",
        observedEndUtc: "2026-10-29T13:55:00.000Z",
      },
      feedback: {
        source: "FEEDBACK_MODULE",
        coverage: "RETAINED_ROWS_ONLY",
        status: "AVAILABLE",
        asOfStart: "2026-10-23T00:00:00.000Z",
        asOfEnd: "2026-10-29T13:55:00.000Z",
        batches: 1,
      },
      retentionPolicy: "APPROVED",
    },
    ...overrides,
  };
}

function row(report: ReturnType<typeof buildValidationReport>, key: string) {
  return report.rows.find(
    (candidate) =>
      `${candidate.section}/${candidate.metric}/${candidate.bucket ?? ""}` ===
      key,
  );
}

afterEach(() => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.APP_REVISION;
});

describe("buildValidationReport", () => {
  it("emits only count-only rows and carries the window, coverage and source", () => {
    const report = buildValidationReport(metrics());

    expect(report.window).toEqual(WINDOW);
    expect(report.asOf).toBe("2026-10-29T13:55:00.000Z");
    expect(report.source).toBe("INTERNAL_VALIDATION_METRICS");
    expect(report.coverage.feedback.status).toBe("AVAILABLE");
    expect(report.glossary.length).toBeGreaterThan(0);
    expect(report.rows.length).toBeGreaterThan(20);
    for (const entry of report.rows) {
      expect(["count", "percent", "seconds"]).toContain(entry.unit);
      expect(Object.keys(entry).sort()).toEqual([
        "bucket",
        "metric",
        "section",
        "suppressed",
        "unit",
        "value",
      ]);
    }
    // No identifier-shaped values survive into the export payload.
    expect(JSON.stringify(report)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i,
    );
  });

  it("suppresses small counts and the total they would otherwise reveal", () => {
    const report = buildValidationReport(metrics());

    expect(row(report, "providers/onboarded_in_period/SHOP")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(
      row(report, "providers/onboarded_in_period/INDEPENDENT"),
    ).toMatchObject({ value: 8, suppressed: false });
    expect(row(report, "providers/onboarded_in_period/TOTAL")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(report.suppression).toEqual({
      minimumGroup: MIN_COHORT,
      applied: true,
    });
  });

  it("keeps zero counts visible and leaves large counts untouched", () => {
    const report = buildValidationReport(metrics());

    expect(row(report, "repairs/status_now/AWAITING_APPROVAL")).toMatchObject({
      value: 0,
      suppressed: false,
    });
    expect(row(report, "tracking/period_views/")).toMatchObject({
      value: 30,
      suppressed: false,
    });
  });

  it("suppresses derived ratios whose input count is suppressed", () => {
    const report = buildValidationReport(
      metrics({
        requests: {
          received: 12,
          decided: { total: 4, accepted: 3, declined: 1 },
          pendingNow: 3,
          cohortAccepted: 3,
          conversionPercent: 25,
          meanDecisionSeconds: 480,
        },
        tracking: {
          periodViews: 30,
          periodRepairsViewed: 8,
          allTimeViews: 90,
          allTimeRepairsViewed: 20,
          allTimeRepairs: 3,
          adoptionPercent: 667,
        },
      }),
    );

    expect(row(report, "requests/conversion_percent/")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(row(report, "requests/mean_decision_seconds/")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(row(report, "tracking/adoption_percent/")).toMatchObject({
      value: null,
      suppressed: true,
    });
  });

  it("keeps N/A ratios explicit instead of turning them into zero", () => {
    const report = buildValidationReport(
      metrics({
        requests: {
          received: 0,
          decided: { total: 0, accepted: 0, declined: 0 },
          pendingNow: 0,
          cohortAccepted: 0,
          conversionPercent: null,
          meanDecisionSeconds: null,
        },
      }),
    );

    expect(row(report, "requests/conversion_percent/")).toMatchObject({
      value: null,
      suppressed: false,
    });
    expect(row(report, "requests/mean_decision_seconds/")).toMatchObject({
      value: null,
      suppressed: false,
    });
  });

  it("suppresses small feedback parts and the feedback total", () => {
    const report = buildValidationReport(
      metrics({ feedback: feedback({ total: 12 }) }),
    );

    expect(row(report, "feedback/by_category/FEATURE_REQUEST")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(row(report, "feedback/total/TOTAL")).toMatchObject({
      value: null,
      suppressed: true,
    });
  });

  it("suppresses small daily buckets", () => {
    const report = buildValidationReport(metrics());

    expect(
      row(report, "activity/active_providers_per_day/2026-10-24"),
    ).toMatchObject({ value: null, suppressed: true });
    expect(row(report, "feedback/per_day/2026-10-27")).toMatchObject({
      value: null,
      suppressed: true,
    });
  });

  it("records missing Feedback data instead of inventing zeroes", () => {
    const report = buildValidationReport(metrics({ feedback: null }));

    expect(report.notes).toContain(
      "Feedback counts are unavailable for this window.",
    );
    expect(report.rows.some((entry) => entry.section === "feedback")).toBe(
      false,
    );
  });

  it("includes a deploy revision only when the environment supplies a real SHA", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234";
    expect(buildValidationReport(metrics()).revision).toBe("abc1234");

    process.env.VERCEL_GIT_COMMIT_SHA = "=cmd|' /C calc'!A0";
    expect(buildValidationReport(metrics()).revision).toBeNull();
  });
});

describe("report serialization", () => {
  function csvRows(csv: string): ReportRow[] {
    const lines = csv.trim().split("\n");
    const header = lines[0].split(",");
    return lines.slice(1).map((line) => {
      const cells = line.split(",");
      const record = Object.fromEntries(
        header.map((column, index) => [column, cells[index]]),
      );
      return {
        section: record.section,
        metric: record.metric,
        bucket: record.bucket || null,
        value: record.value === "" ? null : Number(record.value),
        unit: record.unit as ReportRow["unit"],
        suppressed: record.suppressed === "true",
      };
    });
  }

  it("writes a CSV header and one row per metric with suppressed values blank", () => {
    const report = buildValidationReport(metrics());
    const csv = validationReportToCsv(report);

    expect(csv.split("\n")[0]).toBe(
      "section,metric,bucket,value,unit,suppressed",
    );
    const rows = csvRows(csv);
    expect(rows).toHaveLength(report.rows.length);
    expect(
      rows.find(
        (entry) =>
          entry.metric === "onboarded_in_period" && entry.bucket === "SHOP",
      ),
    ).toMatchObject({ value: null, suppressed: true });
  });

  it("never emits a spreadsheet formula as the first character of a cell", () => {
    const csv = validationReportToCsv(buildValidationReport(metrics()));
    for (const line of csv.trim().split("\n")) {
      for (const cell of line.split(",")) {
        expect(cell).not.toMatch(/^[=+\-@\t\r]/);
      }
    }
  });

  it("writes JSON that round-trips to the same report", () => {
    const report = buildValidationReport(metrics());
    expect(JSON.parse(validationReportToJson(report))).toEqual(
      JSON.parse(JSON.stringify(report)),
    );
  });
});
