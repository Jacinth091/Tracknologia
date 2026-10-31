import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocked: the access guard, the metrics read, the chart component and framework
// navigation. The page renders for real with the fixture.
const feature = vi.hoisted(() => ({
  getValidationMetrics: vi.fn(),
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
  getValidationMetrics: feature.getValidationMetrics,
  recordSensitiveInternalAccess: feature.recordSensitiveInternalAccess,
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
    byStatus: { NEW: 7, REVIEWING: 2, PLANNED: 1, RESOLVED: 1, DISMISSED: 0 },
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
    expect(html).toContain(">7<");
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

  it("shows Unavailable for new feedback when the summary is null", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      feedback: null,
    });

    const html = await renderHome();

    expect(html).toContain(">Unavailable<");
    expect(html).not.toContain("UNAVAILABLE_SCREEN");
  });

  it("keeps the header and shows a notice when the numbers fail", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("unavailable", "UNAVAILABLE"),
    );

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
  });

  it("renders the unavailable screen when the numbers fail and the audit fails", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("unavailable", "UNAVAILABLE"),
    );
    feature.recordSensitiveInternalAccess.mockResolvedValue(false);

    expect(await renderHome()).toBe("UNAVAILABLE_SCREEN");
  });

  it("calls notFound when the metrics read reports forbidden", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("forbidden", "FORBIDDEN"),
    );

    await expect(renderHome()).rejects.toThrow("notFound");
    expect(feature.recordSensitiveInternalAccess).not.toHaveBeenCalled();
  });
});
