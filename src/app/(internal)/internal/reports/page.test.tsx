// Runs in UTC so the rendered timestamps prove the Asia/Manila pin, not the host zone.
process.env.TZ = "UTC";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

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
  REPORT_GLOSSARY: [
    { term: "Providers onboarded", definition: "Providers created in period." },
  ],
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
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import type { ValidationMetrics } from "@/features/internal-operations";
import ReportsPage from "./page";

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
    daily: [{ date: "2026-10-24", distinctProviders: 6 }],
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
  feedback: null,
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
      status: "UNAVAILABLE",
      asOfStart: "2026-10-30T09:00:00.000Z",
      asOfEnd: "2026-10-30T09:00:00.000Z",
      batches: 0,
    },
    retentionPolicy: "APPROVED",
  },
};

async function renderReports(params: Record<string, string> = {}) {
  const element = await ReportsPage({ searchParams: Promise.resolve(params) });
  return renderToStaticMarkup(element);
}

describe("Validation reports page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feature.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-user",
    });
    feature.getValidationMetrics.mockResolvedValue(fixture);
  });

  it("links both exports for the selected period", async () => {
    const html = await renderReports();

    expect(html).toContain(
      'href="/internal/reports/export?format=csv&amp;period=7d"',
    );
    expect(html).toContain(
      'href="/internal/reports/export?format=json&amp;period=7d"',
    );
    expect(html).toContain("2026-10-24 to 2026-10-31");
    expect(html).toContain("Asia/Manila");
  });

  it("carries a custom range into the export links", async () => {
    const html = await renderReports({
      period: "custom",
      start: "2026-10-24",
      end: "2026-10-31",
    });

    expect(html).toContain(
      "format=csv&amp;period=custom&amp;start=2026-10-24&amp;end=2026-10-31",
    );
    expect(feature.getValidationMetrics).toHaveBeenCalledWith({
      mode: "custom",
      startDate: "2026-10-24",
      endDateExclusive: "2026-10-31",
    });
  });

  it("says so when Feedback counts are unavailable instead of showing zero", async () => {
    const html = await renderReports();

    expect(html).toContain("Feedback is unavailable");
    expect(html).toContain("Providers created in period.");
  });

  it("explains suppression and the safe-export boundary", async () => {
    const html = await renderReports();

    expect(html).toContain("Counts from 1 to 4 are suppressed as &lt;5");
    expect(html).toContain("No Provider, Customer, feedback or authentication");
    expect(html).toContain("Retention policy: approved (#87)");
    expect(html).toContain("Suppression applies within each file.");
    expect(html).toContain("snapshots can reveal small changes.");
    expect(html).toContain("Share only reports reviewed");
    expect(html).toContain(
      "together for disclosure with the approved internal/developer audience.",
    );
    expect(html).toContain("Providers created in period.");
  });

  it("explains an invalid period instead of crashing", async () => {
    const { MetricsError } = await import("@/features/internal-operations");
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("bad window", "INVALID_INPUT"),
    );

    expect(await renderReports({ period: "custom" })).toContain(
      "Choose today, 7 or 30 days, or a custom range up to 90 days.",
    );
  });

  it("redirects anonymous visitors to sign in", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAUTHENTICATED",
    });

    await expect(renderReports()).rejects.toThrow(
      "redirect:/login?redirectTo=%2Finternal%2Freports",
    );
  });

  it("hides the page from non-operators", async () => {
    feature.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });

    await expect(renderReports()).rejects.toThrow("notFound");
  });

  it("fails closed when the guard itself is unavailable", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAVAILABLE",
    });

    expect(await renderReports()).toContain("Internal access unavailable");
  });
});
