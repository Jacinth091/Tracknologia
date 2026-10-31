import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocked: the access guard, the metrics read and framework navigation. The
// page renders for real with the fixture.
const feature = vi.hoisted(() => ({
  getValidationMetrics: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
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
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock("./_components/internal-service-unavailable", () => ({
  InternalServiceUnavailable: () => "UNAVAILABLE_SCREEN",
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

describe("internal home headline numbers", () => {
  it("shows the four tiles and the seven-day provider chart", async () => {
    const html = await renderHome();

    expect(html).toContain("Providers (all time)");
    expect(html).toContain(">21</p>");
    expect(html).toContain("Open repairs (now)");
    expect(html).toContain(">18</p>");
    expect(html).toContain("Pending requests (now)");
    expect(html).toContain(">5</p>");
    expect(html).toContain("New feedback (now)");
    expect(html).toContain(">7</p>");
    expect(html).toContain(
      'aria-label="Active providers, last 7 days, Oct 24 to Oct 30, peak 3 on Oct 27"',
    );
    expect(feature.recordSensitiveInternalAccess).not.toHaveBeenCalled();
  });

  it("shows Unavailable for new feedback when the summary is null", async () => {
    feature.getValidationMetrics.mockResolvedValue({
      ...fixture,
      feedback: null,
    });

    const html = await renderHome();

    expect(html).toContain(">Unavailable</p>");
    expect(html).not.toContain("UNAVAILABLE_SCREEN");
  });

  it("keeps the links and shows a notice when the numbers fail", async () => {
    feature.getValidationMetrics.mockRejectedValue(
      new MetricsError("unavailable", "UNAVAILABLE"),
    );

    const html = await renderHome();

    expect(html).toContain(
      "Numbers are unavailable right now. Try again in a moment.",
    );
    expect(html).toContain("Feedback Inbox");
    expect(html).toContain("Validation metrics");
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
