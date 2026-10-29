import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkClientRateLimit: vi.fn(),
  createInternalOpsClient: vi.fn(),
  createPublicOperationClient: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
  requireInternalOperator: vi.fn(),
  requireProviderContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rate-limit", () => ({
  checkClientRateLimit: mocks.checkClientRateLimit,
}));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: mocks.createPublicOperationClient,
}));

vi.mock("@/lib/supabase/internal", () => ({
  createInternalOpsClient: mocks.createInternalOpsClient,
}));

vi.mock("@/features/auth", () => {
  class AuthError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message);
    }
  }
  return { AuthError, requireProviderContext: mocks.requireProviderContext };
});

vi.mock("@/features/internal-operations/access", () => ({
  recordSensitiveInternalAccess: mocks.recordSensitiveInternalAccess,
  requireInternalOperator: mocks.requireInternalOperator,
}));

import {
  recordFeedbackReview,
  submitPublicFeedback,
  submitProviderFeedback,
} from "./commands";
import { getFeedbackAggregateSummary, listInternalFeedback } from "./queries";
import {
  feedbackReviewDecisionSchema,
  feedbackSummaryWindowSchema,
  submitFeedbackSchema,
} from "./schemas";
import { FeedbackError } from "./types";

const NONCE = "5f0c6f7e-3b1a-4c5d-8e9f-0a1b2c3d4e5f";
const REVIEWER_ID = "00000000-0000-4000-8000-0000000000aa";
const FEEDBACK_ID = "00000000-0000-4000-8000-0000000000bb";

function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    category: "BUG",
    title: "  Tracking page  ",
    message: "The tracking page shows an error.",
    submissionNonce: NONCE,
    ...overrides,
  };
}

async function captureError(promise: Promise<unknown>): Promise<FeedbackError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FeedbackError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a FeedbackError");
}

function currentStateClient(
  row: { status: string; row_version: number } | null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), rpc: mocks.rpc };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.checkClientRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
  mocks.createPublicOperationClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: "ACCEPTED", error: null });
  mocks.recordSensitiveInternalAccess.mockResolvedValue(true);
});

describe("Feedback submission ordering", () => {
  it("consumes the shared budget before parsing or persisting", async () => {
    mocks.checkClientRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });

    const error = await captureError(
      submitPublicFeedback({ category: "NOPE", forged: true }),
    );

    expect(mocks.checkClientRateLimit).toHaveBeenCalledWith("feedback_submit");
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(42);
    expect(mocks.createPublicOperationClient).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter is unavailable", async () => {
    mocks.checkClientRateLimit.mockRejectedValue(new Error("db down"));

    const error = await captureError(submitPublicFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
    expect(mocks.createPublicOperationClient).not.toHaveBeenCalled();
  });

  it("counts invalid public input against the budget and never persists it", async () => {
    const error = await captureError(
      submitPublicFeedback(validSubmission({ message: "   " })),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.checkClientRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns the same generic receipt on an accepted write", async () => {
    await expect(submitPublicFeedback(validSubmission())).resolves.toEqual({
      accepted: true,
    });

    expect(mocks.rpc).toHaveBeenCalledWith("submit_feedback", {
      p_submission_nonce: NONCE,
      p_category: "BUG",
      p_source: "PUBLIC_FEEDBACK",
      p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      p_title: "Tracking page",
      p_message: "The tracking page shows an error.",
    });
  });

  it("never reports success for an unexpected RPC result", async () => {
    mocks.rpc.mockResolvedValue({ data: "MAYBE", error: null });

    const error = await captureError(submitPublicFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
  });

  it("rejects forged trusted fields without echoing them", async () => {
    const error = await captureError(
      submitPublicFeedback(
        validSubmission({ source: "PROVIDER_WORKSPACE", status: "RESOLVED" }),
      ),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe("Feedback contains unsupported fields");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Provider feedback", () => {
  it.each([
    [{ providerType: "SHOP", role: "OWNER" }, "SHOP_OWNER"],
    [{ providerType: "SHOP", role: "STAFF" }, "SHOP_STAFF"],
    [{ providerType: "INDEPENDENT", role: "OWNER" }, "INDEPENDENT_REPAIRER"],
  ])(
    "derives the participant class from membership %j",
    async (context, participantClass) => {
      mocks.requireProviderContext.mockResolvedValue(context);

      await submitProviderFeedback(validSubmission());

      expect(mocks.rpc).toHaveBeenCalledWith(
        "submit_feedback",
        expect.objectContaining({
          p_source: "PROVIDER_WORKSPACE",
          p_participant_class: participantClass,
        }),
      );
    },
  );

  it("denies removed or anonymous callers before the budget or any write", async () => {
    mocks.requireProviderContext.mockRejectedValue(
      Object.assign(new Error("no membership"), { code: "NO_MEMBERSHIP" }),
    );

    const error = await captureError(submitProviderFeedback(validSubmission()));

    expect(error.code).toBe("FORBIDDEN");
    expect(mocks.checkClientRateLimit).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Internal feedback reads", () => {
  it("performs no privileged query for a non-operator", async () => {
    mocks.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });

    const error = await captureError(listInternalFeedback({}));

    expect(error.code).toBe("FORBIDDEN");
    expect(mocks.recordSensitiveInternalAccess).not.toHaveBeenCalled();
    expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
  });

  it("withholds protected data when the access audit fails", async () => {
    mocks.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: REVIEWER_ID,
    });
    mocks.recordSensitiveInternalAccess.mockResolvedValue(false);

    const error = await captureError(getFeedbackAggregateSummary({}));

    expect(error.code).toBe("UNAVAILABLE");
    expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
  });
});

describe("Feedback review", () => {
  beforeEach(() => {
    mocks.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: REVIEWER_ID,
    });
  });

  it("rejects a stale version before any review write", async () => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 2 }),
    );

    const error = await captureError(
      recordFeedbackReview(
        FEEDBACK_ID,
        { status: "REVIEWING", priority: "NORMAL" },
        1,
      ),
    );

    expect(error.code).toBe("CONFLICT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an illegal transition before any review write", async () => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 1 }),
    );

    const error = await captureError(
      recordFeedbackReview(
        FEEDBACK_ID,
        { status: "PLANNED", priority: "NORMAL" },
        1,
      ),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a reason to reopen a resolved item", async () => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "RESOLVED", row_version: 3 }),
    );

    const error = await captureError(
      recordFeedbackReview(
        FEEDBACK_ID,
        { status: "REVIEWING", priority: "NORMAL" },
        3,
      ),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("records a legal review with the verified operator identity", async () => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "REVIEWING", row_version: 1 }),
    );
    mocks.rpc.mockResolvedValue({ data: 2, error: null });

    await expect(
      recordFeedbackReview(
        FEEDBACK_ID,
        {
          status: "RESOLVED",
          priority: "HIGH",
          internalNotes: "Fixed in a follow-up",
          linkedIssueUrl:
            "https://github.com/Jacinth091/Tracknologia/issues/12",
        },
        1,
      ),
    ).resolves.toEqual({ status: "RESOLVED", priority: "HIGH", rowVersion: 2 });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_feedback_review",
      expect.objectContaining({
        p_feedback_id: FEEDBACK_ID,
        p_operator_user_id: REVIEWER_ID,
        p_expected_row_version: 1,
        p_target_status: "RESOLVED",
        p_linked_issue_url:
          "https://github.com/Jacinth091/Tracknologia/issues/12",
      }),
    );
  });
});

describe("Feedback schemas", () => {
  it("counts code points, not UTF-16 units, for the message bound", () => {
    const atLimit = "😀".repeat(2000);
    const overLimit = "😀".repeat(2001);

    expect(
      submitFeedbackSchema.safeParse(validSubmission({ message: atLimit }))
        .success,
    ).toBe(true);
    expect(
      submitFeedbackSchema.safeParse(validSubmission({ message: overLimit }))
        .success,
    ).toBe(false);
  });

  it("trims only ASCII edge whitespace and keeps tabs inside text", () => {
    const parsed = submitFeedbackSchema.safeParse(
      validSubmission({ message: " kept\tinside " }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.message).toBe(" kept\tinside ");
    }
  });

  it("rejects disallowed control characters and stores blank titles as null", () => {
    expect(
      submitFeedbackSchema.safeParse(validSubmission({ message: "bad\u0007" }))
        .success,
    ).toBe(false);

    const parsed = submitFeedbackSchema.safeParse(
      validSubmission({ title: "   " }),
    );
    expect(parsed.success && parsed.data.title).toBe(null);
  });

  it("accepts only canonical GitHub issue links for this repository", () => {
    const decision = (linkedIssueUrl: string) =>
      feedbackReviewDecisionSchema.safeParse({
        status: "PLANNED",
        priority: "NORMAL",
        linkedIssueUrl,
      }).success;

    expect(
      decision("https://github.com/Jacinth091/Tracknologia/issues/12"),
    ).toBe(true);
    expect(
      decision("https://github.com/Jacinth091/Tracknologia/issues/12?x=1"),
    ).toBe(false);
    expect(
      decision("http://github.com/Jacinth091/Tracknologia/issues/12"),
    ).toBe(false);
    expect(
      decision("https://github.com/Jacinth091/Tracknologia/issues/0"),
    ).toBe(false);
  });

  it("limits summary windows to 1 to 31 UTC days", () => {
    expect(
      feedbackSummaryWindowSchema.safeParse({
        startDate: "2026-10-01",
        endDateExclusive: "2026-11-01",
      }).success,
    ).toBe(true);
    expect(
      feedbackSummaryWindowSchema.safeParse({
        startDate: "2026-10-01",
        endDateExclusive: "2026-11-02",
      }).success,
    ).toBe(false);
  });
});
