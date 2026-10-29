import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked: the trusted operator guard, the Supabase client factory (persistence
// seam), and framework/unrelated seams the review path imports but never calls
// for these inputs. The feature schema and recordFeedbackReview run for real.
const seams = vi.hoisted(() => ({
  requireInternalOperator: vi.fn(),
  createInternalOpsClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/features/internal-operations/access", () => ({
  requireInternalOperator: seams.requireInternalOperator,
  recordSensitiveInternalAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/internal", () => ({
  createInternalOpsClient: seams.createInternalOpsClient,
}));

vi.mock("@/features/auth", () => ({
  AuthError: class extends Error {},
  requireProviderContext: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ checkClientRateLimit: vi.fn() }));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: vi.fn(),
}));

import { recordFeedbackReviewAction } from "./actions";

const FEEDBACK_ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const LINK = "https://github.com/Jacinth091/Tracknologia/issues/12";

const COMPLETE_FIELDS = {
  feedbackId: FEEDBACK_ID,
  expectedRowVersion: "2",
  status: "REVIEWING",
  priority: "NORMAL",
  internalNotes: "Escalated to developer",
  linkedIssueUrl: LINK,
};

function reviewForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }
  return form;
}

function withoutFields(names: string[]): Record<string, string> {
  const fields: Record<string, string> = { ...COMPLETE_FIELDS };
  for (const name of names) {
    delete fields[name];
  }
  return fields;
}

describe("recordFeedbackReviewAction missing review keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seams.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e",
    });
  });

  it.each([
    ["internalNotes omitted", ["internalNotes"]],
    ["linkedIssueUrl omitted", ["linkedIssueUrl"]],
    ["both omitted", ["internalNotes", "linkedIssueUrl"]],
  ])(
    "rejects %s as INVALID_INPUT before any persistence call",
    async (_label, omitted) => {
      const state = await recordFeedbackReviewAction(
        null,
        reviewForm(withoutFields(omitted)),
      );

      expect(state).toEqual({
        error: "Review details are invalid",
        appliedRowVersion: 2,
      });
      expect(seams.createInternalOpsClient).not.toHaveBeenCalled();
    },
  );
});
