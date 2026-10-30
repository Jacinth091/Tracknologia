// Runs in UTC so the rendered times prove the Asia/Manila pin, not the host zone.
process.env.TZ = "UTC";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocked: the feature read (the data seam) and framework navigation. The page
// renders for real with the mocked detail; the triage form is a stub because
// it is a client component with its own action wiring.
const feature = vi.hoisted(() => ({ getInternalFeedback: vi.fn() }));

vi.mock("@/features/feedback", () => ({
  FeedbackError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  getInternalFeedback: feature.getInternalFeedback,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock("../_components/feedback-triage-form", () => ({
  FeedbackTriageForm: () => null,
}));

import FeedbackDetailPage from "./page";

const FEEDBACK_ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
// 16:30 UTC on Oct 31 is 00:30 on Nov 1 in Asia/Manila (UTC+8).
const INSTANT = "2026-10-31T16:30:00.000Z";

function detailAt(instant: string) {
  return {
    original: {
      id: FEEDBACK_ID,
      category: "BUG",
      source: "PUBLIC_TRACKING",
      participantClass: "PUBLIC_SELF_REPORTED_CUSTOMER",
      title: null,
      message: "The tracking page shows an error.",
      createdAt: instant,
    },
    review: {
      status: "REVIEWING",
      priority: "NORMAL",
      internalNotes: null,
      linkedIssueUrl: null,
      rowVersion: 2,
      reviewedAt: instant,
    },
    history: {
      items: [
        {
          eventId: "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e",
          fromStatus: "NEW",
          toStatus: "REVIEWING",
          priorityBefore: "NORMAL",
          priorityAfter: "NORMAL",
          rowVersion: 2,
          reason: null,
          occurredAt: instant,
        },
      ],
      truncated: false,
    },
  };
}

describe("Feedback detail page times", () => {
  it("renders submitted and history times on the Manila calendar day under UTC", async () => {
    expect(new Date(0).getTimezoneOffset()).toBe(0);
    feature.getInternalFeedback.mockResolvedValue(detailAt(INSTANT));

    const element = await FeedbackDetailPage({
      params: Promise.resolve({ feedbackId: FEEDBACK_ID }),
    });
    const html = renderToStaticMarkup(element);

    // Both the submitted line and the history event show Nov 1, 00:30 Manila.
    expect(html).toMatch(/(1 Nov 2026|Nov 1, 2026),\s12:30\s?am/i);
    expect(html.match(/12:30\s?am/gi)).toHaveLength(2);
    // The UTC wall clock (Oct 31, 16:30) must not leak into the page.
    expect(html).not.toMatch(/Oct 31|31 Oct|4:30\s?pm/i);
  });
});

describe("Feedback detail page review aids", () => {
  function detailWithOriginal(overrides: Record<string, unknown>) {
    const detail = detailAt(INSTANT);
    return { ...detail, original: { ...detail.original, ...overrides } };
  }

  it("shows the personal-details badge and runbook pointer when flagged", async () => {
    feature.getInternalFeedback.mockResolvedValue(
      detailWithOriginal({ message: "Reach me at a@example.com" }),
    );

    const html = renderToStaticMarkup(
      await FeedbackDetailPage({
        params: Promise.resolve({ feedbackId: FEEDBACK_ID }),
      }),
    );

    expect(html).toContain("May contain personal details");
    expect(html).toContain("docs/OPERATIONS.md");
  });

  it("flags a title that looks like contact details", async () => {
    feature.getInternalFeedback.mockResolvedValue(
      detailWithOriginal({ title: "Call 0917 123 4567" }),
    );

    const html = renderToStaticMarkup(
      await FeedbackDetailPage({
        params: Promise.resolve({ feedbackId: FEEDBACK_ID }),
      }),
    );

    expect(html).toContain("May contain personal details");
  });

  it("omits the badge and runbook pointer when nothing looks like contact details", async () => {
    feature.getInternalFeedback.mockResolvedValue(detailAt(INSTANT));

    const html = renderToStaticMarkup(
      await FeedbackDetailPage({
        params: Promise.resolve({ feedbackId: FEEDBACK_ID }),
      }),
    );

    expect(html).not.toContain("May contain personal details");
    expect(html).not.toContain("docs/OPERATIONS.md");
  });
});
