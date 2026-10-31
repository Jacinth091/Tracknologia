// Runs in UTC so the rendered timestamps prove the Asia/Manila pin, not the host zone.
process.env.TZ = "UTC";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocked: the guarded metrics read (the data seam), the access guard, and
// framework navigation. The page renders for real with the fixture.
const feature = vi.hoisted(() => ({
  getValidationMetrics: vi.fn(),
  requireInternalOperator: vi.fn(),
}));

vi.mock("@/features/internal-operations", () => ({
  MetricsError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  getValidationMetrics: feature.getValidationMetrics,
  requireInternalOperator: feature.requireInternalOperator,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import { MetricsError } from "@/features/internal-operations";
import type { ValidationMetrics } from "@/features/internal-operations";
import ActivityPage from "./page";

const fixture: ValidationMetrics = {
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
    daily: [
      { date: "2026-10-24", distinctProviders: 1 },
      { date: "2026-10-25", distinctProviders: 2 },
      { date: "2026-10-26", distinctProviders: 0 },
      { date: "2026-10-27", distinctProviders: 3 },
      { date: "2026-10-28", distinctProviders: 1 },
      { date: "2026-10-29", distinctProviders: 3 },
      { date: "2026-10-30", distinctProviders: 2 },
    ],
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
  feedback: {
    asOf: "2026-10-30T09:00:00.000Z",
    window: {
      timeZone: "Asia/Manila",
      startDate: "2026-10-24",
      endDateExclusive: "2026-10-31",
      days: 7,
    },
    snapshot: "CURRENT_STATUS",
    retention: { policy: "UNAPPROVED", coverage: "RETAINED_ROWS_ONLY" },
    total: 9,
    byCategory: { BUG: 2, USABILITY: 3, FEATURE_REQUEST: 1, GENERAL: 3 },
    bySource: {
      PUBLIC_TRACKING: 4,
      PUBLIC_REQUEST: 2,
      PUBLIC_FEEDBACK: 3,
      PROVIDER_WORKSPACE: 0,
    },
    byStatus: { NEW: 5, REVIEWING: 2, PLANNED: 1, RESOLVED: 1, DISMISSED: 0 },
    daily: [
      { date: "2026-10-24", count: 1 },
      { date: "2026-10-25", count: 0 },
      { date: "2026-10-26", count: 2 },
      { date: "2026-10-27", count: 0 },
      { date: "2026-10-28", count: 1 },
      { date: "2026-10-29", count: 0 },
      { date: "2026-10-30", count: 0 },
    ],
  },
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
      status: "AVAILABLE",
      asOfStart: "2026-10-30T09:00:00.000Z",
      asOfEnd: "2026-10-30T09:00:00.000Z",
      batches: 1,
    },
    retentionPolicy: "UNAPPROVED",
  },
};

async function renderActivity(params: Record<string, string> = {}) {
  const element = await ActivityPage({
    searchParams: Promise.resolve(params),
  });
  return renderToStaticMarkup(element);
}

describe("Validation metrics page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feature.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-user",
    });
    feature.getValidationMetrics.mockResolvedValue(fixture);
  });

  it("renders the values with the period and generated time", async () => {
    const html = await renderActivity();

    expect(html).toContain(">21<");
    expect(html).toContain(">64%<");
    expect(html).toContain(">50%<");
    expect(html).toContain("3 h 20 min");
    expect(html).toContain("2026-10-24 to 2026-10-31");
    expect(html).toContain("Asia/Manila");
  });

  it("renders each chart with its heading and summary", async () => {
    const html = await renderActivity();

    expect(html).toContain("<h2");
    expect(html).toContain(
      'aria-label="Active providers per day, Oct 24 to Oct 30, peak 3 on Oct 27"',
    );
    expect(html).toContain(
      'aria-label="Feedback per day, Oct 24 to Oct 30, peak 2 on Oct 26"',
    );
    expect(html).toContain(
      'aria-label="Repairs by status (now), largest Completed at 33"',
    );
    expect(html).toContain(
      'aria-label="Feedback by category, largest Usability at 3"',
    );
  });

  it("shows Unavailable in place of the feedback charts", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      feedback: null,
    });

    const html = await renderActivity();

    expect(html).toContain("Feedback per day");
    expect(html).toContain("Feedback by category");
    expect(html).not.toContain("Feedback per day, ");
    expect(html).not.toContain("Feedback by category, ");
  });

  it("notes no activity when every daily value is zero", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      activity: {
        ...fixture.activity,
        daily: fixture.activity.daily.map((day) => ({
          ...day,
          distinctProviders: 0,
        })),
      },
    });

    const html = await renderActivity();

    expect(html).toContain(
      "Active providers per day, Oct 24 to Oct 30, no activity in this period",
    );
    expect(html).toContain("No activity in this period.");
  });

  it("renders null ratios as N/A, never as 0", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      requests: { ...fixture.requests, conversionPercent: null },
      tracking: { ...fixture.tracking, adoptionPercent: null },
    });

    const html = await renderActivity();

    expect(html.match(/>N\/A</g)).toHaveLength(2);
    expect(html).not.toMatch(/>\s*0(?:\.0+)?%\s*</);
  });

  it("renders unavailable feedback when the summary is null", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      feedback: null,
      coverage: {
        ...fixture.coverage,
        feedback: {
          ...fixture.coverage.feedback,
          status: "UNAVAILABLE",
          asOfStart: null,
          asOfEnd: null,
          batches: 0,
        },
      },
    });

    const html = await renderActivity();

    expect(html).toContain("Unavailable for this period.");
    expect(html).not.toContain("By category");
  });

  it("calls notFound for a forbidden operator", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("Internal access is not available", "FORBIDDEN"),
    );

    await expect(
      ActivityPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("notFound");
  });

  it("redirects an unauthenticated visitor to login", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAUTHENTICATED",
    });

    await expect(
      ActivityPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("redirect:/login?redirectTo=%2Finternal%2Factivity");
  });

  it("renders the unavailable state when metrics are unavailable", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("Validation metrics are unavailable.", "UNAVAILABLE"),
    );

    const html = await renderActivity();

    expect(html).toContain("Internal access unavailable");
    expect(html).not.toContain("<h1");
  });

  it("shows the invalid-period message with the picker", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("Metrics period is invalid", "INVALID_INPUT"),
    );

    const html = await renderActivity({
      period: "custom",
      start: "2026-01-01",
    });

    expect(html).toContain("up to 90 days");
    expect(html).toContain('name="period"');
    expect(html).toContain('name="start"');
  });

  it("maps URL params to the window input and defaults to 7d", async () => {
    await renderActivity({ period: "30d" });
    expect(feature.getValidationMetrics).toHaveBeenLastCalledWith({
      mode: "30d",
    });

    await renderActivity({
      period: "custom",
      start: "2026-10-01",
      end: "2026-10-08",
    });
    expect(feature.getValidationMetrics).toHaveBeenLastCalledWith({
      mode: "custom",
      startDate: "2026-10-01",
      endDateExclusive: "2026-10-08",
    });

    await renderActivity({});
    expect(feature.getValidationMetrics).toHaveBeenLastCalledWith({
      mode: "7d",
    });

    await renderActivity({ period: "bogus" });
    expect(feature.getValidationMetrics).toHaveBeenLastCalledWith({
      mode: "7d",
    });
  });

  it("renders no raw identifiers", async () => {
    const html = await renderActivity();

    expect(html).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});
