// Runs in UTC so the rendered time proves the Asia/Manila pin, not the host zone.
process.env.TZ = "UTC";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Mocked: the feature read (the data seam), framework navigation, and the icon
// package. The inbox page renders for real with the mocked preview list.
const feature = vi.hoisted(() => ({ listInternalFeedback: vi.fn() }));

vi.mock("@/features/feedback", () => ({
  FeedbackError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
  listInternalFeedback: feature.listInternalFeedback,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock("@hugeicons/react", () => ({ HugeiconsIcon: () => null }));
vi.mock("@hugeicons/core-free-icons", () => ({
  ArrowRight01Icon: null,
  Message01Icon: null,
}));

import FeedbackInboxPage from "./page";

const FEEDBACK_ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
// 16:30 UTC on Oct 31 is 00:30 on Nov 1 in Asia/Manila (UTC+8).
const INSTANT = "2026-10-31T16:30:00.000Z";

describe("Feedback inbox page times", () => {
  it("renders submitted times on the Manila calendar day under UTC", async () => {
    expect(new Date(0).getTimezoneOffset()).toBe(0);
    feature.listInternalFeedback.mockResolvedValue({
      items: [
        {
          id: FEEDBACK_ID,
          category: "BUG",
          source: "PUBLIC_TRACKING",
          participantClass: "PUBLIC_SELF_REPORTED_CUSTOMER",
          title: "Tracking error",
          status: "NEW",
          priority: "NORMAL",
          rowVersion: 1,
          createdAt: INSTANT,
          reviewedAt: null,
        },
      ],
      nextCursor: null,
    });

    const element = await FeedbackInboxPage({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toMatch(/(1 Nov 2026|Nov 1, 2026),\s12:30\s?am/i);
    expect(html).not.toMatch(/Oct 31|31 Oct|4:30\s?pm/i);
  });
});
