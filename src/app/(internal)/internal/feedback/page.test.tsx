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
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children}</a>
  ),
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

function preview(overrides: Record<string, unknown> = {}) {
  return {
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
    mayContainContactDetails: false,
    ...overrides,
  };
}

const BADGE = "May contain personal details";

describe("Feedback inbox review aids", () => {
  it("shows the personal-details badge only on flagged previews", async () => {
    feature.listInternalFeedback.mockResolvedValue({
      items: [
        preview({ mayContainContactDetails: true }),
        preview({ id: "7a2d3e4f-5b6c-4d7e-8f80-9a0b1c2d3e4f" }),
      ],
      nextCursor: null,
    });

    const html = renderToStaticMarkup(
      await FeedbackInboxPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html.split(BADGE)).toHaveLength(2);
  });

  it("keeps the due filter checked and in the paging link", async () => {
    feature.listInternalFeedback.mockResolvedValue({
      items: [preview()],
      nextCursor: `${INSTANT}|${FEEDBACK_ID}`,
    });

    const html = renderToStaticMarkup(
      await FeedbackInboxPage({
        searchParams: Promise.resolve({ due: "1" }),
      }),
    );

    expect(feature.listInternalFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ dueForReview: true }),
    );
    expect(html).toMatch(/<input[^>]*name="due"[^>]*checked=""/);
    expect(html).toMatch(/href="\/internal\/feedback\?due=1(&amp;|&)cursor=/);
  });

  it("does not request the due filter without due=1", async () => {
    feature.listInternalFeedback.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await FeedbackInboxPage({ searchParams: Promise.resolve({}) });

    expect(feature.listInternalFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ dueForReview: undefined }),
    );
  });
});
