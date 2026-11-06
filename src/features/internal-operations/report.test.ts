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
        IN_PROGRESS: 8,
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
    const input = metrics();
    input.repairs.statusNow.IN_PROGRESS = 10;
    input.repairs.statusNow.WAITING_FOR_PARTS = 0;
    input.repairs.created = {
      total: 11,
      customerRequest: 5,
      providerCreated: 6,
    };
    const report = buildValidationReport(input);

    expect(row(report, "repairs/status_now/AWAITING_APPROVAL")).toMatchObject({
      value: 0,
      suppressed: false,
    });
    expect(row(report, "tracking/period_views/")).toMatchObject({
      value: 30,
      suppressed: false,
    });
  });

  it("hides the all-time Repair total and adoption when a status is small", () => {
    const input = metrics();
    expect(
      Object.values(input.repairs.statusNow).reduce((a, b) => a + b, 0),
    ).toBe(input.tracking.allTimeRepairs);
    const report = buildValidationReport(input);

    for (const key of [
      "repairs/status_now/WAITING_FOR_PARTS",
      "tracking/all_time_repairs/",
      "tracking/adoption_percent/",
    ]) {
      expect(row(report, key)).toMatchObject({ value: null, suppressed: true });
    }
    expect(row(report, "repairs/status_now/IN_PROGRESS")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(row(report, "tracking/all_time_repairs_viewed/")).toMatchObject({
      value: 20,
      suppressed: false,
    });

    expect(JSON.parse(validationReportToJson(report)).rows).toEqual(
      report.rows,
    );
    const csv = validationReportToCsv(report);
    expect(csv).toContain("row,tracking,all_time_repairs,,,count,true");
    expect(csv).toContain("row,tracking,adoption_percent,,,percent,true");
  });

  it("keeps the all-time Repair total and adoption when every Repair count is zero or large", () => {
    const input = metrics();
    input.repairs.statusNow.IN_PROGRESS = 10;
    input.repairs.statusNow.WAITING_FOR_PARTS = 0;
    input.repairs.created = {
      total: 11,
      customerRequest: 5,
      providerCreated: 6,
    };
    expect(
      Object.values(input.repairs.statusNow).reduce((a, b) => a + b, 0),
    ).toBe(input.tracking.allTimeRepairs);
    const report = buildValidationReport(input);

    expect(row(report, "tracking/all_time_repairs/")).toMatchObject({
      value: 25,
      suppressed: false,
    });
    expect(row(report, "tracking/adoption_percent/")).toMatchObject({
      value: 80,
      suppressed: false,
    });
  });

  it.each(["today", "7d", "30d", "custom"] as const)(
    "pools first-week 6/5/1 Repairs across status, creation and tracking complements (%s)",
    (mode) => {
      const input = metrics({
        repairs: {
          statusNow: {
            IN_PROGRESS: 5,
            WAITING_FOR_PARTS: 0,
            AWAITING_APPROVAL: 0,
            READY: 1,
            COMPLETED: 0,
          },
          created: { total: 6, customerRequest: 0, providerCreated: 6 },
          completed: 0,
          readyReached: 1,
          statusMaintained: 1,
        },
        requests: {
          received: 0,
          decided: { total: 0, accepted: 0, declined: 0 },
          pendingNow: 0,
          cohortAccepted: 0,
          conversionPercent: null,
          meanDecisionSeconds: null,
        },
        tracking: {
          periodViews: 6,
          periodRepairsViewed: 6,
          allTimeViews: 6,
          allTimeRepairsViewed: 6,
          allTimeRepairs: 6,
          adoptionPercent: 100,
        },
        activity: {
          distinctProviders: 1,
          repeatProviders: 0,
          daily: [{ date: WINDOW.startDate, distinctProviders: 1 }],
        },
        feedback: null,
      });
      const days = mode === "today" ? 1 : mode === "30d" ? 30 : 7;
      input.window = {
        ...WINDOW,
        mode,
        days,
        endDateExclusive: new Date(
          Date.parse(`${WINDOW.startDate}T00:00:00Z`) + days * 86_400_000,
        )
          .toISOString()
          .slice(0, 10),
        endUtc: new Date(
          Date.parse(WINDOW.startUtc) + days * 86_400_000,
        ).toISOString(),
      };
      input.asOf = new Date(
        Date.parse(input.window.endUtc) - 60_000,
      ).toISOString();
      input.coverage.domain.observedEndUtc = input.asOf;
      input.coverage.feedback = {
        source: "FEEDBACK_MODULE",
        coverage: "RETAINED_ROWS_ONLY",
        status: "UNAVAILABLE",
        asOfStart: null,
        asOfEnd: null,
        batches: 0,
      };
      expect(
        Object.values(input.repairs.statusNow).reduce((a, b) => a + b, 0),
      ).toBe(6);
      expect(input.repairs.created.total).toBe(input.tracking.allTimeRepairs);

      const report = buildValidationReport(input);
      const json = JSON.parse(validationReportToJson(report));
      const repairRows = report.rows.filter(
        (entry) => entry.section === "repairs",
      );
      expect(repairRows.length).toBeGreaterThan(0);
      expect(
        repairRows.every((entry) => entry.suppressed && entry.value === null),
      ).toBe(true);
      expect(json.rows).toEqual(report.rows);
      const csvRepairRows = validationReportToCsv(report)
        .split("\n")
        .filter((line) => line.startsWith("row,repairs,"));
      expect(csvRepairRows).toHaveLength(repairRows.length);
      for (const line of csvRepairRows) {
        const fields = line.split(",");
        expect(fields[4]).toBe("");
        expect(fields[6]).toBe("true");
      }
      for (const key of [
        "tracking/all_time_repairs/",
        "tracking/adoption_percent/",
      ]) {
        expect(row(report, key)).toMatchObject({
          value: null,
          suppressed: true,
        });
      }
      expect(row(report, "tracking/period_views/")).toMatchObject({
        value: 6,
        suppressed: false,
      });
      expect(row(report, "requests/received/")).toMatchObject({
        value: 0,
        suppressed: false,
      });
      expect(row(report, "requests/conversion_percent/")).toMatchObject({
        value: null,
        suppressed: false,
      });
    },
  );

  it("does not reveal a small Repair origin through a large current-status partition", () => {
    const input = metrics();
    input.repairs = {
      statusNow: {
        IN_PROGRESS: 10,
        WAITING_FOR_PARTS: 0,
        AWAITING_APPROVAL: 0,
        READY: 6,
        COMPLETED: 9,
      },
      created: { total: 25, customerRequest: 1, providerCreated: 24 },
      completed: 9,
      readyReached: 15,
      statusMaintained: 15,
    };
    input.requests = {
      received: 1,
      decided: { total: 1, accepted: 1, declined: 0 },
      pendingNow: 0,
      cohortAccepted: 1,
      conversionPercent: 100,
      meanDecisionSeconds: 60,
    };
    input.activity = {
      distinctProviders: 1,
      repeatProviders: 0,
      daily: [{ date: WINDOW.startDate, distinctProviders: 1 }],
    };
    input.tracking.periodRepairsViewed = 20;
    input.tracking.allTimeViews = input.tracking.periodViews;
    expect(
      Object.values(input.repairs.statusNow).reduce((a, b) => a + b, 0),
    ).toBe(input.repairs.created.total);

    const report = buildValidationReport(input);
    expect(
      report.rows
        .filter((entry) => entry.section === "repairs")
        .every((entry) => entry.suppressed && entry.value === null),
    ).toBe(true);
    expect(row(report, "tracking/all_time_repairs/")).toMatchObject({
      value: null,
      suppressed: true,
    });
    expect(row(report, "tracking/adoption_percent/")).toMatchObject({
      value: null,
      suppressed: true,
    });
  });

  it("pools Request counts and ratios when their complements reveal a small pending cohort", () => {
    const input = metrics({
      requests: {
        received: 6,
        decided: { total: 5, accepted: 5, declined: 0 },
        pendingNow: 1,
        cohortAccepted: 5,
        conversionPercent: 83,
        meanDecisionSeconds: 60,
      },
    });
    input.repairs.created = {
      total: 11,
      customerRequest: 5,
      providerCreated: 6,
    };
    const report = buildValidationReport(input);
    const requestRows = report.rows.filter(
      (entry) => entry.section === "requests",
    );
    expect(
      requestRows.every((entry) => entry.suppressed && entry.value === null),
    ).toBe(true);
    expect(JSON.parse(validationReportToJson(report)).rows).toEqual(
      report.rows,
    );
    const csvRows = validationReportToCsv(report)
      .split("\n")
      .filter((line) => line.startsWith("row,requests,"));
    expect(csvRows).toHaveLength(requestRows.length);
    expect(
      csvRows.every(
        (line) => line.split(",")[4] === "" && line.endsWith(",true"),
      ),
    ).toBe(true);
  });

  it("keeps Request counts and ratios when every Request count is zero or large", () => {
    const report = buildValidationReport(
      metrics({
        requests: {
          received: 10,
          decided: { total: 5, accepted: 5, declined: 0 },
          pendingNow: 5,
          cohortAccepted: 5,
          conversionPercent: 50,
          meanDecisionSeconds: 60,
        },
      }),
    );
    expect(row(report, "requests/received/")).toMatchObject({
      value: 10,
      suppressed: false,
    });
    expect(row(report, "requests/decided/DECLINED")).toMatchObject({
      value: 0,
      suppressed: false,
    });
    expect(row(report, "requests/conversion_percent/")).toMatchObject({
      value: 50,
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

  it("pools the whole Feedback section when any partition has a small count", () => {
    // Category 2 is small. Source and status partitions would otherwise sum
    // to the visible total of 12 and reveal it by subtraction.
    const report = buildValidationReport(
      metrics({
        feedback: feedback({
          total: 12,
          byCategory: { BUG: 2, USABILITY: 5, FEATURE_REQUEST: 5, GENERAL: 0 },
          bySource: {
            PUBLIC_TRACKING: 6,
            PUBLIC_REQUEST: 6,
            PUBLIC_FEEDBACK: 0,
            PROVIDER_WORKSPACE: 0,
          },
          byStatus: {
            NEW: 12,
            REVIEWING: 0,
            PLANNED: 0,
            RESOLVED: 0,
            DISMISSED: 0,
          },
          daily: [{ date: "2026-10-27", count: 12 }],
        }),
      }),
    );

    const feedbackRows = report.rows.filter(
      (entry) => entry.section === "feedback",
    );
    expect(feedbackRows.length).toBeGreaterThan(0);
    expect(
      feedbackRows.every((entry) => entry.suppressed && entry.value === null),
    ).toBe(true);
    expect(feedbackRows.map((entry) => entry.value)).not.toContain(12);
    expect(report.notes.join(" ")).toContain("Feedback is pooled as a whole");
    // Other sections keep their visible values.
    expect(row(report, "tracking/period_views/")).toMatchObject({
      value: 30,
      suppressed: false,
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
    return csv
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("row,"))
      .map((line) => {
        const [, section, metric, bucket, value, unit, suppressed] =
          line.split(",");
        return {
          section,
          metric,
          bucket: bucket || null,
          value: value === "" ? null : Number(value),
          unit: unit as ReportRow["unit"],
          suppressed: suppressed === "true",
        };
      });
  }

  it("writes report context, glossary, notes and one row per metric", () => {
    const report = buildValidationReport(metrics());
    const csv = validationReportToCsv(report);

    expect(csv.split("\n")[0]).toBe(
      "record,section,metric,bucket,value,unit,suppressed",
    );
    expect(csv).toContain("meta,,generatedAt,,");
    expect(csv).toContain("meta,,window.timeZone,,Asia/Manila,,");
    expect(csv).toContain("meta,,window.startUtc,,2026-10-22T16:00:00.000Z,,");
    expect(csv).toContain("meta,,source,,INTERNAL_VALIDATION_METRICS,,");
    expect(csv).toContain("meta,,coverage.feedback.status,,AVAILABLE,,");
    expect(csv).toContain("meta,,suppression.minimumGroup,,5,,");
    expect(csv).toContain("glossary,,Providers onboarded,,");
    expect(csv).toContain("note,,,,");
    expect(csv).toContain("meta,,revision,,,,");

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
