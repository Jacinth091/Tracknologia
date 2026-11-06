import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocked: the access guard, the metrics read, the chart component and framework
// navigation. The page renders for real with the fixture.
const feature = vi.hoisted(() => ({
  deploymentRevision: vi.fn(),
  getInternalHealth: vi.fn(),
  getValidationMetrics: vi.fn(),
  getNewFeedbackCount: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
  requireInternalOperator: vi.fn(),
}));

type DayChartProps = {
  seriesLabel: string;
  summary: string;
  data: { label: string; value: number }[];
};

const charts = vi.hoisted(() => ({
  DayBarChart: vi.fn((_props: DayChartProps) => "DAY_BAR_CHART"),
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
  deploymentRevision: feature.deploymentRevision,
  getInternalHealth: feature.getInternalHealth,
  getValidationMetrics: feature.getValidationMetrics,
  recordSensitiveInternalAccess: feature.recordSensitiveInternalAccess,
  requireInternalOperator: feature.requireInternalOperator,
}));

vi.mock("@/features/feedback", () => ({
  FeedbackError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  getNewFeedbackCount: feature.getNewFeedbackCount,
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
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("./_components/internal-service-unavailable", () => ({
  InternalServiceUnavailable: () => "UNAVAILABLE_SCREEN",
}));

vi.mock("./_components/metric-charts", () => ({
  DayBarChart: charts.DayBarChart,
}));

import { MetricsError } from "@/features/internal-operations";
import { FeedbackError } from "@/features/feedback";
import InternalPage from "./page";

const fixture = {
  providers: { allTime: { shop: 12, independent: 9, total: 21 } },
  repairs: {
    statusNow: {
      IN_PROGRESS: 11,
      WAITING_FOR_PARTS: 2,
      AWAITING_APPROVAL: 1,
      READY: 4,
      COMPLETED: 33,
    },
  },
  requests: { pendingNow: 5 },
  activity: {
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
  feedback: {
    byStatus: { NEW: 1, REVIEWING: 2, PLANNED: 1, RESOLVED: 1, DISMISSED: 0 },
  },
  asOf: "2026-10-30T12:00:00.000Z",
  coverage: {
    feedback: { status: "AVAILABLE" },
  },
};

async function renderHome() {
  return renderToStaticMarkup(await InternalPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  feature.requireInternalOperator.mockResolvedValue({
    status: "ALLOWED",
    userId: "operator-user",
  });
  feature.recordSensitiveInternalAccess.mockResolvedValue(true);
  feature.getValidationMetrics.mockResolvedValue(fixture);
  feature.getNewFeedbackCount.mockResolvedValue(2);
  feature.getInternalHealth.mockResolvedValue({
    checkedAt: "2026-10-30T12:00:00.000Z",
    application: {
      status: "healthy",
      latencyMs: null,
      observedAt: "2026-10-30T12:00:00.000Z",
    },
    database: {
      status: "healthy",
      latencyMs: 42,
      observedAt: "2026-10-30T12:00:00.000Z",
    },
    auth: {
      status: "degraded",
      latencyMs: 1500,
      observedAt: "2026-10-30T12:00:00.000Z",
    },
    email: { status: "unknown", latencyMs: null, observedAt: null },
  });
  feature.deploymentRevision.mockReturnValue("abc1234");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("internal overview headline numbers", () => {
  it("shows the four tiles and passes the seven-day rows to the chart", async () => {
    const html = await renderHome();

    expect(html).toContain("Providers (all time)");
    expect(html).toContain(">21<");
    expect(html).toContain("Open repairs (now)");
    expect(html).toContain(">18<");
    expect(html).toContain("Pending requests (now)");
    expect(html).toContain(">5<");
    expect(html).toContain("New feedback (now)");
    expect(html).toContain(">2<");
    expect(feature.getNewFeedbackCount).toHaveBeenCalledTimes(1);
    expect(html).toContain('href="/internal/feedback?status=NEW"');

    const [chart] = charts.DayBarChart.mock.calls.map(([props]) => props);
    expect(chart.seriesLabel).toBe("Active providers");
    expect(chart.summary).toBe(
      "Active providers, last 7 days, Oct 24 to Oct 30, peak 3 on Oct 27",
    );
    expect(chart.data[3]).toEqual({ label: "Oct 27", value: 3 });
    expect(feature.recordSensitiveInternalAccess).not.toHaveBeenCalled();
  });

  it("shows the empty state instead of an all-zero chart", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      activity: {
        daily: fixture.activity.daily.map((day) => ({
          ...day,
          distinctProviders: 0,
        })),
      },
    });

    const html = await renderHome();

    expect(html).toContain("No provider activity in the last 7 days");
    expect(charts.DayBarChart).not.toHaveBeenCalled();
  });

  it("keeps the current backlog available when period feedback is unavailable", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      feedback: null,
    });

    const html = await renderHome();

    expect(html).toContain(">2<");
    expect(html).not.toContain(">Unavailable<");
    expect(html).not.toContain("UNAVAILABLE_SCREEN");
  });

  it("shows an empty backlog as zero", async () => {
    feature.getNewFeedbackCount.mockResolvedValue(0);
    expect(await renderHome()).toContain(">0<");
  });

  it("keeps other metrics visible when the backlog count is unavailable", async () => {
    feature.getNewFeedbackCount.mockRejectedValue(
      new FeedbackError("unavailable", "UNAVAILABLE"),
    );
    const html = await renderHome();
    expect(html).toContain(">Unavailable<");
    expect(html).toContain("Providers (all time)");
  });

  it("denies the page when access is revoked before the backlog read", async () => {
    feature.getNewFeedbackCount.mockRejectedValue(
      new FeedbackError("forbidden", "FORBIDDEN"),
    );
    await expect(renderHome()).rejects.toThrow("notFound");
  });

  it("keeps system status visible when metrics fail after a successful fallback audit", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("unavailable", "UNAVAILABLE"),
    );
    feature.getInternalHealth.mockResolvedValue({
      checkedAt: "2026-10-30T12:00:00.000Z",
      application: { status: "healthy", latencyMs: null, observedAt: null },
      database: { status: "unavailable", latencyMs: null, observedAt: null },
      auth: { status: "healthy", latencyMs: 42, observedAt: null },
      email: { status: "unknown", latencyMs: null, observedAt: null },
    });

    const html = await renderHome();

    expect(html).toContain("Overview");
    expect(html).toContain(
      "Numbers are unavailable right now. Try again in a moment.",
    );
    expect(html).not.toContain("Providers (all time)");
    expect(html).not.toContain("UNAVAILABLE_SCREEN");
    expect(feature.recordSensitiveInternalAccess).toHaveBeenCalledTimes(1);
    expect(feature.recordSensitiveInternalAccess).toHaveBeenCalledWith(
      "INTERNAL_ACCESS_VIEW",
    );
    expect(feature.getInternalHealth).toHaveBeenCalledTimes(1);
    expect(
      feature.recordSensitiveInternalAccess.mock.invocationCallOrder[0],
    ).toBeLessThan(feature.getInternalHealth.mock.invocationCallOrder[0]);
    expect(html).toContain("System status");
    expect(html).toMatch(/Database<\/dt><dd>.*?>Unavailable</);
    expect(html).toContain(">Healthy<");
    expect(html).toContain(">Unknown<");
    expect(html).toContain("Not observed");
    expect(html).toContain("abc1234");
    expect(html).toContain('href="/internal/health"');
    expect(html).toContain('href="/internal/diagnostics"');
    expect(html).toMatch(
      /Domain metrics as of<\/dt><dd[^>]*>Unavailable<\/dd>/,
    );
    expect(html).toMatch(/Feedback coverage<\/dt><dd[^>]*>Unavailable<\/dd>/);
  });

  it("renders the unavailable screen when the numbers fail and the audit fails", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("unavailable", "UNAVAILABLE"),
    );
    feature.recordSensitiveInternalAccess.mockResolvedValue(false);

    expect(await renderHome()).toBe("UNAVAILABLE_SCREEN");
    expect(feature.getInternalHealth).not.toHaveBeenCalled();
    expect(feature.deploymentRevision).not.toHaveBeenCalled();
  });

  it("calls notFound when the metrics read reports forbidden", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("forbidden", "FORBIDDEN"),
    );

    await expect(renderHome()).rejects.toThrow("notFound");
    expect(feature.recordSensitiveInternalAccess).not.toHaveBeenCalled();
    expect(feature.getInternalHealth).not.toHaveBeenCalled();
  });

  it("shows truthful system status without treating missing telemetry as healthy", async () => {
    const html = await renderHome();

    expect(html).toContain("System status");
    expect(html).toContain(">Healthy<");
    expect(html).toContain(">Degraded<");
    expect(html).toContain(">Unknown<");
    expect(html).toContain(
      "Not observed — no independent monitor is connected.",
    );
    expect(html).toContain("abc1234");
    expect(html).toContain("Domain metrics as of");
    expect(html).toContain("Oct 30, 2026, 8:00 PM");
    expect(html).toContain('href="/internal/health"');
    expect(html).toContain('href="/internal/diagnostics"');
  });

  it("states when service checks are unavailable", async () => {
    feature.getInternalHealth.mockRejectedValue(
      new Error("private-health-detail"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const html = await renderHome();

    expect(html).toContain("Service checks are unavailable right now.");
    expect(html).toContain("Nothing is assumed healthy.");
    expect(log.mock.calls).toEqual([
      ["[INTERNAL_OVERVIEW_FAILURE] health read threw"],
    ]);
  });

  it("states when feedback coverage is unavailable", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      coverage: { feedback: { status: "UNAVAILABLE" } },
    });

    expect(await renderHome()).toContain("Unavailable");
  });

  it("says the release is not reported instead of inventing one", async () => {
    feature.deploymentRevision.mockReturnValue(null);

    expect(await renderHome()).toContain("Not reported by this runtime");
  });
});
