import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

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

import { AuthError, type AuthErrorCode } from "@/features/auth";

import {
  buildFeedbackCountSummary,
  getInternalFeedback,
  getFeedbackAggregateSummary,
  listInternalFeedback,
} from "./queries";
import {
  recordFeedbackReview,
  submitPublicFeedback,
  submitProviderFeedback,
} from "./commands";
import {
  feedbackListOptionsSchema,
  feedbackReviewDecisionSchema,
  feedbackSummaryWindowSchema,
  submitFeedbackSchema,
} from "./schemas";
import { FeedbackError } from "./types";
import {
  listFeedbackPreviews,
  readFeedbackCurrentState,
  readFeedbackDetail,
  readFeedbackSummaryRows,
} from "./persistence";

const NONCE = "5f0c6f7e-3b1a-4c5d-8e9f-0a1b2c3d4e5f";
const REVIEWER_ID = "00000000-0000-4000-8000-0000000000aa";
const FEEDBACK_ID = "00000000-0000-4000-8000-0000000000bb";
const CANARY = "SECRET-CANARY-7c1e-do-not-log";

function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    category: "BUG",
    title: "  Tracking page  ",
    message: "The tracking page shows an error.",
    submissionNonce: NONCE,
    ...overrides,
  };
}

function reviewDecision(overrides: Record<string, unknown> = {}) {
  return {
    status: "REVIEWING",
    priority: "NORMAL",
    internalNotes: null,
    linkedIssueUrl: null,
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

function allowOperator() {
  mocks.requireInternalOperator.mockResolvedValue({
    status: "ALLOWED",
    userId: REVIEWER_ID,
  });
}

// Every public call passes the limiter; the denial cases override this.
function allowBudget() {
  mocks.checkClientRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  allowBudget();
  mocks.createPublicOperationClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: "ACCEPTED", error: null });
  mocks.recordSensitiveInternalAccess.mockResolvedValue(true);
});

afterEach(() => {
  errorSpy.mockRestore();
});

function loggedText() {
  return JSON.stringify(errorSpy.mock.calls);
}

describe("Feedback budget and public submission", () => {
  it("denies with a bounded retry before any parse or write", async () => {
    mocks.checkClientRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 999_999,
    });

    const error = await captureError(
      submitPublicFeedback({ category: "NOPE", forged: true }),
    );

    expect(mocks.checkClientRateLimit).toHaveBeenCalledWith("feedback_submit");
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(86_400);
    expect(mocks.createPublicOperationClient).not.toHaveBeenCalled();
  });

  it.each([
    [
      "throws",
      () => mocks.checkClientRateLimit.mockRejectedValue(new Error(CANARY)),
    ],
    [
      "returns a non-boolean decision",
      () => mocks.checkClientRateLimit.mockResolvedValue({ allowed: "yes" }),
    ],
    [
      "denies with a non-finite retry",
      () =>
        mocks.checkClientRateLimit.mockResolvedValue({
          allowed: false,
          retryAfterSeconds: Number.NaN,
        }),
    ],
  ])("fails closed when the limiter %s", async (_label, arrange) => {
    arrange();

    const error = await captureError(submitPublicFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
    expect(mocks.createPublicOperationClient).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(CANARY);
  });

  it("consumes exactly one budget for invalid input", async () => {
    const error = await captureError(
      submitPublicFeedback(validSubmission({ message: "   " })),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.checkClientRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed trusted source once the budget is spent", async () => {
    const error = await captureError(
      submitPublicFeedback(validSubmission(), "PROVIDER_WORKSPACE"),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.checkClientRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns the same receipt for a same-nonce retry", async () => {
    const first = await submitPublicFeedback(validSubmission());
    const second = await submitPublicFeedback(validSubmission());

    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: true });
    expect(
      mocks.rpc.mock.calls.map(([, args]) => args.p_submission_nonce),
    ).toEqual([NONCE, NONCE]);
  });

  it("names forged trusted fields generically without echoing them", async () => {
    const error = await captureError(
      submitPublicFeedback(
        validSubmission({ source: "PROVIDER_WORKSPACE", status: "RESOLVED" }),
      ),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toBe("Feedback contains unsupported fields");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sanitizes an RPC error and logs only its SQLSTATE", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: `insert failed ${CANARY}`, code: "23505" },
    });

    const error = await captureError(submitPublicFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).not.toContain(CANARY);
    expect(loggedText()).toContain("23505");
    expect(loggedText()).not.toContain(CANARY);
  });

  it("sanitizes a thrown transport error", async () => {
    mocks.rpc.mockRejectedValue(new Error(CANARY));

    const error = await captureError(submitPublicFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).not.toContain(CANARY);
    expect(loggedText()).not.toContain(CANARY);
  });

  it("sanitizes a failed client creation", async () => {
    mocks.createPublicOperationClient.mockRejectedValue(new Error(CANARY));

    const error = await captureError(submitPublicFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
    expect(loggedText()).not.toContain(CANARY);
  });

  it.each([{ data: "MAYBE" }, { data: null }])(
    "never reports success for an unexpected RPC result %j",
    async (response) => {
      mocks.rpc.mockResolvedValue({ error: null, ...response });

      const error = await captureError(submitPublicFeedback(validSubmission()));

      expect(error.code).toBe("UNAVAILABLE");
    },
  );
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

  const expectedMembershipCodes: AuthErrorCode[] = [
    "NO_MEMBERSHIP",
    "UNAUTHENTICATED",
  ];

  it.each(expectedMembershipCodes)(
    "maps expected %s to FORBIDDEN before the budget",
    async (code) => {
      mocks.requireProviderContext.mockRejectedValue(
        new AuthError("expected", code),
      );

      const error = await captureError(
        submitProviderFeedback(validSubmission()),
      );

      expect(error.code).toBe("FORBIDDEN");
      expect(mocks.checkClientRateLimit).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "an infrastructure AuthError",
      new AuthError("db", "INFRASTRUCTURE_FAILURE"),
    ],
    ["an unexpected throw", new Error(CANARY)],
  ])("maps %s to UNAVAILABLE without the message", async (_label, thrown) => {
    mocks.requireProviderContext.mockRejectedValue(thrown);

    const error = await captureError(submitProviderFeedback(validSubmission()));

    expect(error.code).toBe("UNAVAILABLE");
    expect(error.message).not.toContain(CANARY);
    expect(loggedText()).not.toContain(CANARY);
  });
});

describe("Internal operations: guard denial", () => {
  const cases = {
    list: () => listInternalFeedback({}),
    detail: () => getInternalFeedback(FEEDBACK_ID),
    summary: () =>
      getFeedbackAggregateSummary({
        startDate: "2026-10-01",
        endDateExclusive: "2026-10-02",
      }),
    review: () =>
      recordFeedbackReview(FEEDBACK_ID, { status: "NOPE" }, "not-a-version"),
  } as const;

  it.each(Object.keys(cases) as Array<keyof typeof cases>)(
    "%s is FORBIDDEN before any query, audit, or input parse",
    async (name) => {
      mocks.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });

      const error = await captureError(cases[name]());

      expect(error.code).toBe("FORBIDDEN");
      expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
      expect(mocks.recordSensitiveInternalAccess).not.toHaveBeenCalled();
    },
  );

  it.each(Object.keys(cases) as Array<keyof typeof cases>)(
    "%s is UNAVAILABLE when the guard itself is unavailable",
    async (name) => {
      mocks.requireInternalOperator.mockResolvedValue({
        status: "UNAVAILABLE",
      });

      const error = await captureError(cases[name]());

      expect(error.code).toBe("UNAVAILABLE");
      expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
    },
  );

  it.each(["list", "detail", "summary"] as const)(
    "%s withholds protected data when the access audit fails",
    async (name) => {
      allowOperator();
      mocks.recordSensitiveInternalAccess.mockResolvedValue(false);

      const error = await captureError(cases[name]());

      expect(error.code).toBe("UNAVAILABLE");
      expect(mocks.recordSensitiveInternalAccess).toHaveBeenCalledWith(
        "INTERNAL_ACCESS_VIEW",
      );
      expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
    },
  );

  it("returns null for a malformed detail identifier after the guard", async () => {
    allowOperator();

    await expect(getInternalFeedback("not-a-uuid")).resolves.toBeNull();
    expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
  });
});

describe("Feedback review", () => {
  beforeEach(() => {
    allowOperator();
  });

  it("rejects a stale version before any review write", async () => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 2 }),
    );

    const error = await captureError(
      recordFeedbackReview(FEEDBACK_ID, reviewDecision(), 1),
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
        reviewDecision({ status: "PLANNED" }),
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
      recordFeedbackReview(FEEDBACK_ID, reviewDecision(), 3),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["null", { internalNotes: null, linkedIssueUrl: null, reason: null }],
    ["blank", { internalNotes: "  ", linkedIssueUrl: "", reason: " " }],
  ])("clears optional fields that are %s", async (_label, optional) => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 1 }),
    );
    mocks.rpc.mockResolvedValue({ data: 2, error: null });

    await recordFeedbackReview(
      FEEDBACK_ID,
      reviewDecision({ status: "DISMISSED", ...optional }),
      1,
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_feedback_review",
      expect.objectContaining({
        p_internal_notes: null,
        p_linked_issue_url: null,
        p_reason: null,
      }),
    );
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

  it.each([
    [{ data: 1, error: null }],
    [{ data: 3, error: null }],
    [{ data: "2", error: null }],
    [{ data: null, error: null }],
  ])("rejects a malformed or non-incremented result %j", async (response) => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 1 }),
    );
    mocks.rpc.mockResolvedValue(response);

    const error = await captureError(
      recordFeedbackReview(FEEDBACK_ID, reviewDecision(), 1),
    );

    expect(error.code).toBe("UNAVAILABLE");
  });

  it.each([
    ["FEEDBACK_VERSION_CONFLICT", "CONFLICT"],
    ["FEEDBACK_NOT_FOUND", "NOT_FOUND"],
    ["FEEDBACK_INVALID_TRANSITION", "INVALID_INPUT"],
    ["Internal operator access required", "FORBIDDEN"],
  ])("maps the review exception %s to %s", async (token, code) => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 1 }),
    );
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: `ERROR: ${token}`, code: "P0001" },
    });

    const error = await captureError(
      recordFeedbackReview(FEEDBACK_ID, reviewDecision(), 1),
    );

    expect(error.code).toBe(code);
  });

  it("sanitizes an unrecognized review exception", async () => {
    mocks.createInternalOpsClient.mockResolvedValue(
      currentStateClient({ status: "NEW", row_version: 1 }),
    );
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: `column "x" ${CANARY}`, code: "42703" },
    });

    const error = await captureError(
      recordFeedbackReview(FEEDBACK_ID, reviewDecision(), 1),
    );

    expect(error.code).toBe("UNAVAILABLE");
    expect(loggedText()).toContain("42703");
    expect(loggedText()).not.toContain(CANARY);
  });

  it.each([
    ["an out-of-range version", FEEDBACK_ID, reviewDecision(), 2_147_483_648],
    [
      "a NUL in notes",
      FEEDBACK_ID,
      reviewDecision({ internalNotes: "a\u0000b" }),
      1,
    ],
    [
      "an over-long link",
      FEEDBACK_ID,
      reviewDecision({
        linkedIssueUrl: `https://github.com/Jacinth091/Tracknologia/issues/${"1".repeat(2050)}`,
      }),
      1,
    ],
    [
      "a link with a query",
      FEEDBACK_ID,
      reviewDecision({
        linkedIssueUrl:
          "https://github.com/Jacinth091/Tracknologia/issues/12?x=1",
      }),
      1,
    ],
  ])("rejects %s before any query", async (_label, id, decision, version) => {
    const error = await captureError(
      recordFeedbackReview(id, decision, version),
    );

    expect(error.code).toBe("INVALID_INPUT");
    expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
  });
});

describe("Review decision completeness", () => {
  it.each([
    ["internalNotes", { linkedIssueUrl: null }],
    ["linkedIssueUrl", { internalNotes: null }],
    ["either field", {}],
  ])(
    "rejects a decision that omits %s before any read or write",
    async (_label, present) => {
      allowOperator();

      const error = await captureError(
        recordFeedbackReview(
          FEEDBACK_ID,
          { status: "REVIEWING", priority: "NORMAL", ...present },
          1,
        ),
      );

      expect(error.code).toBe("INVALID_INPUT");
      expect(mocks.createInternalOpsClient).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("keeps reason optional while both review keys are explicit", () => {
    expect(
      feedbackReviewDecisionSchema.safeParse({
        status: "REVIEWING",
        priority: "NORMAL",
        internalNotes: null,
        linkedIssueUrl: null,
      }).success,
    ).toBe(true);
  });
});

describe("Feedback schemas", () => {
  it("counts code points, not UTF-16 units, for the message bound", () => {
    expect(
      submitFeedbackSchema.safeParse(
        validSubmission({ message: "😀".repeat(2000) }),
      ).success,
    ).toBe(true);
    expect(
      submitFeedbackSchema.safeParse(
        validSubmission({ message: "😀".repeat(2001) }),
      ).success,
    ).toBe(false);
  });

  it("trims only ASCII edge whitespace and keeps tabs inside text", () => {
    const parsed = submitFeedbackSchema.safeParse(
      validSubmission({ message: " kept\tinside " }),
    );

    expect(parsed.success && parsed.data.message).toBe(" kept\tinside ");
  });

  it("rejects NUL and other forbidden controls in participant text", () => {
    for (const message of ["bad\u0000", "bad\u0007"]) {
      expect(
        submitFeedbackSchema.safeParse(validSubmission({ message })).success,
      ).toBe(false);
    }
  });

  it("stores null for a null or blank title", () => {
    for (const title of [null, "   "]) {
      const parsed = submitFeedbackSchema.safeParse(validSubmission({ title }));
      expect(parsed.success && parsed.data.title).toBe(null);
    }
  });

  it("accepts only the exact canonical GitHub issue link", () => {
    const linked = (linkedIssueUrl: string) =>
      feedbackReviewDecisionSchema.safeParse({
        status: "PLANNED",
        priority: "NORMAL",
        internalNotes: null,
        linkedIssueUrl,
      }).success;

    expect(linked("https://github.com/Jacinth091/Tracknologia/issues/12")).toBe(
      true,
    );
    for (const value of [
      "https://github.com/Jacinth091/Tracknologia/issues/12?x=1",
      "https://github.com/Jacinth091/Tracknologia/issues/12#top",
      "https://user@github.com/Jacinth091/Tracknologia/issues/12",
      "http://github.com/Jacinth091/Tracknologia/issues/12",
      "https://github.com/Jacinth091/Tracknologia/issues/0",
      "not a url",
    ]) {
      expect(linked(value)).toBe(false);
    }
  });

  it("validates the keyset cursor semantically", () => {
    const cursor = (value: string) =>
      feedbackListOptionsSchema.safeParse({ cursor: value }).success;

    expect(cursor(`2026-10-30T09:00:00.123456+00:00|${FEEDBACK_ID}`)).toBe(
      true,
    );
    expect(cursor(`2026-13-40T09:00:00Z|${FEEDBACK_ID}`)).toBe(false);
    expect(cursor(`yesterday|${FEEDBACK_ID}`)).toBe(false);
    expect(cursor("2026-10-30T09:00:00Z|not-a-uuid")).toBe(false);
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

// A query result that is both chainable and awaitable, so the persistence
// functions see the same shape PostgREST returns.
function queryResult(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "eq", "or"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

const VALID_DETAIL_ROW = {
  id: FEEDBACK_ID,
  category: "BUG",
  source: "PUBLIC_TRACKING",
  participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
  title: null,
  message: "The tracking page shows an error.",
  created_at: "2026-10-01T00:00:00+00:00",
  status: "NEW",
  priority: "NORMAL",
  internal_notes: null,
  linked_issue_url: null,
  row_version: 1,
  reviewed_at: null,
};

describe("Persistence response boundaries", () => {
  it.each([[null], [undefined]])(
    "fails closed when a successful list returns data %s",
    async (data) => {
      const client = {
        from: vi.fn(() => queryResult({ data, error: null })),
      } as unknown as SupabaseClient;

      const error = await captureError(listFeedbackPreviews(client, {}));

      expect(error.code).toBe("UNAVAILABLE");
    },
  );

  it("returns an empty page only for a real empty array", async () => {
    const client = {
      from: vi.fn(() => queryResult({ data: [], error: null })),
    } as unknown as SupabaseClient;

    await expect(listFeedbackPreviews(client, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it.each([[null], [undefined]])(
    "fails closed when the summary RPC returns data %s",
    async (data) => {
      const client = {
        rpc: vi.fn(async () => ({ data, error: null })),
      } as unknown as SupabaseClient;

      const error = await captureError(
        readFeedbackSummaryRows(client, REVIEWER_ID, {
          start: "2026-10-01T00:00:00.000Z",
          endExclusive: "2026-10-02T00:00:00.000Z",
        }),
      );

      expect(error.code).toBe("UNAVAILABLE");
    },
  );

  it("returns no summary rows only for a real empty array", async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as SupabaseClient;

    await expect(
      readFeedbackSummaryRows(client, REVIEWER_ID, {
        start: "2026-10-01T00:00:00.000Z",
        endExclusive: "2026-10-02T00:00:00.000Z",
      }),
    ).resolves.toEqual([]);
  });

  it.each([[null], [undefined]])(
    "fails closed when the review history returns data %s",
    async (data) => {
      const client = {
        from: vi.fn((table: string) =>
          table === "feedback_submissions"
            ? queryResult({ data: VALID_DETAIL_ROW, error: null })
            : queryResult({ data, error: null }),
        ),
      } as unknown as SupabaseClient;

      const error = await captureError(readFeedbackDetail(client, FEEDBACK_ID));

      expect(error.code).toBe("UNAVAILABLE");
    },
  );

  it("returns an empty history only for a real empty array", async () => {
    const client = {
      from: vi.fn((table: string) =>
        table === "feedback_submissions"
          ? queryResult({ data: VALID_DETAIL_ROW, error: null })
          : queryResult({ data: [], error: null }),
      ),
    } as unknown as SupabaseClient;

    const detail = await readFeedbackDetail(client, FEEDBACK_ID);

    expect(detail?.history).toEqual({ items: [], truncated: false });
  });

  it("treats only a null maybeSingle result as an authorized missing row", async () => {
    const client = {
      from: vi.fn(() => queryResult({ data: null, error: null })),
    } as unknown as SupabaseClient;

    await expect(readFeedbackDetail(client, FEEDBACK_ID)).resolves.toBeNull();
    await expect(
      readFeedbackCurrentState(client, FEEDBACK_ID),
    ).resolves.toBeNull();
  });

  it.each([[undefined], [0], [""], [false]])(
    "fails closed for a non-null maybeSingle value %j instead of reporting missing",
    async (data) => {
      const client = {
        from: vi.fn(() => queryResult({ data, error: null })),
      } as unknown as SupabaseClient;

      const detail = await captureError(
        readFeedbackDetail(client, FEEDBACK_ID),
      );
      const state = await captureError(
        readFeedbackCurrentState(client, FEEDBACK_ID),
      );

      expect(detail.code).toBe("UNAVAILABLE");
      expect(state.code).toBe("UNAVAILABLE");
    },
  );
});

describe("Manila summary periods", () => {
  it("sends Manila midnights to the RPC as UTC instants and labels the zone", async () => {
    allowOperator();
    mocks.createInternalOpsClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const summary = await getFeedbackAggregateSummary({
      startDate: "2026-11-01",
      endDateExclusive: "2026-11-02",
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_feedback_count_summary", {
      p_operator_user_id: REVIEWER_ID,
      p_window_start: "2026-10-31T16:00:00.000Z",
      p_window_end: "2026-11-01T16:00:00.000Z",
    });
    expect(summary.window).toEqual({
      timeZone: "Asia/Manila",
      startDate: "2026-11-01",
      endDateExclusive: "2026-11-02",
      days: 1,
    });
    expect(summary.daily).toEqual([{ date: "2026-11-01", count: 0 }]);
  });
});

describe("Count summary projection", () => {
  it("zero-fills empty groups and days, and keeps day order", () => {
    const summary = buildFeedbackCountSummary(
      [
        { dimension: "CATEGORY", bucket: "BUG", row_count: 2 },
        { dimension: "SOURCE", bucket: "PUBLIC_TRACKING", row_count: 2 },
        { dimension: "STATUS", bucket: "NEW", row_count: 2 },
        { dimension: "DAY", bucket: "2026-10-01", row_count: 2 },
        { dimension: "DAY", bucket: "2026-10-03", row_count: 0 },
      ],
      {
        timeZone: "Asia/Manila",
        startDate: "2026-10-01",
        endDateExclusive: "2026-10-04",
        days: 3,
      },
      "2026-10-29T00:00:00.000Z",
    );

    expect(summary.total).toBe(2);
    expect(summary.byCategory.GENERAL).toBe(0);
    expect(summary.bySource.PROVIDER_WORKSPACE).toBe(0);
    expect(summary.byStatus.REVIEWING).toBe(0);
    expect(summary.daily).toEqual([
      { date: "2026-10-01", count: 2 },
      { date: "2026-10-02", count: 0 },
      { date: "2026-10-03", count: 0 },
    ]);
    expect(summary.retention).toEqual({
      policy: "UNAPPROVED",
      coverage: "RETAINED_ROWS_ONLY",
    });
  });
});
