import "server-only";

import {
  AuthError,
  requireProviderContext,
  type ProviderContext,
} from "@/features/auth";
import { requireInternalOperator } from "@/features/internal-operations/access";
import { checkClientRateLimit } from "@/lib/rate-limit";
import { createInternalOpsClient } from "@/lib/supabase/internal";
import { createPublicOperationClient } from "@/lib/supabase/service";

import { feedbackUnavailable, sanitizeFeedbackError } from "./errors";
import {
  insertFeedbackSubmission,
  readFeedbackCurrentState,
  recordFeedbackReviewRecord,
  type FeedbackSubmissionRecord,
} from "./persistence";
import {
  expectedRowVersionSchema,
  feedbackIdSchema,
  feedbackReviewDecisionSchema,
  publicFeedbackSourceSchema,
  submitFeedbackSchema,
  type SubmitFeedbackInput,
} from "./schemas";
import {
  FeedbackError,
  type FeedbackParticipantClass,
  type FeedbackReceipt,
  type FeedbackReviewResult,
  type FeedbackStatus,
  type PublicFeedbackSource,
} from "./types";

// Legal status moves, mirroring record_feedback_review. Repeating the current
// status is always an edit; reopening a resolved or dismissed item needs a reason.
const ALLOWED_STATUS_MOVES: Record<FeedbackStatus, readonly FeedbackStatus[]> =
  {
    NEW: ["NEW", "REVIEWING", "DISMISSED"],
    REVIEWING: ["REVIEWING", "PLANNED", "RESOLVED", "DISMISSED"],
    PLANNED: ["PLANNED", "RESOLVED", "REVIEWING", "DISMISSED"],
    RESOLVED: ["RESOLVED", "REVIEWING"],
    DISMISSED: ["DISMISSED", "REVIEWING"],
  };

const MAX_RETRY_AFTER_SECONDS = 86_400;

// The shared public and Provider budget runs once, before any input is parsed,
// so a denied or failed limiter never reaches validation or persistence. A
// limiter result that is not a boolean decision fails closed.
async function consumeFeedbackBudget(): Promise<void> {
  const limit = await checkClientRateLimit("feedback_submit");

  if (typeof limit?.allowed !== "boolean") {
    throw feedbackUnavailable("feedback abuse control");
  }
  if (limit.allowed) {
    return;
  }

  const retry = limit.retryAfterSeconds;
  if (typeof retry !== "number" || !Number.isFinite(retry)) {
    throw feedbackUnavailable("feedback abuse control");
  }

  throw new FeedbackError(
    "Too many feedback submissions from this connection. Please try again later.",
    "RATE_LIMITED",
    Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(retry))),
  );
}

function parseSubmission(input: unknown): SubmitFeedbackInput {
  const parsed = submitFeedbackSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  // Unknown keys (for example a forged source, class, or reviewer) are named
  // generically so the error never echoes the submitted field or value.
  const forgedFields = parsed.error.issues.some(
    (issue) => issue.code === "unrecognized_keys",
  );
  throw new FeedbackError(
    forgedFields
      ? "Feedback contains unsupported fields"
      : (parsed.error.issues[0]?.message ?? "Feedback is invalid"),
    "INVALID_INPUT",
  );
}

async function persistSubmission(
  input: SubmitFeedbackInput,
  source: PublicFeedbackSource | "PROVIDER_WORKSPACE",
  participantClass: FeedbackParticipantClass,
): Promise<FeedbackReceipt> {
  const record: FeedbackSubmissionRecord = {
    nonce: input.submissionNonce,
    category: input.category,
    source,
    participantClass,
    title: input.title,
    message: input.message,
  };

  await insertFeedbackSubmission(await createPublicOperationClient(), record);
  return { accepted: true };
}

// The Provider's class comes from trusted membership, never from the browser.
function providerParticipantClass(
  context: ProviderContext,
): FeedbackParticipantClass {
  if (context.providerType === "INDEPENDENT") {
    return "INDEPENDENT_REPAIRER";
  }
  return context.role === "OWNER" ? "SHOP_OWNER" : "SHOP_STAFF";
}

// Expected membership outcomes are FORBIDDEN. Anything else from auth is an
// infrastructure fault and stays UNAVAILABLE.
function providerAccessError(error: unknown): FeedbackError {
  if (
    error instanceof AuthError &&
    (error.code === "UNAUTHENTICATED" || error.code === "NO_MEMBERSHIP")
  ) {
    return new FeedbackError(
      "Provider access is required to send this feedback",
      "FORBIDDEN",
    );
  }
  return feedbackUnavailable("provider membership", error);
}

/**
 * Records anonymous feedback from a public surface. The trusted source is
 * validated against the public allow-list (a malformed value is INVALID_INPUT,
 * never an uncaught schema error); the participant class is always
 * PUBLIC_SELF_REPORTED_CUSTOMER.
 */
export async function submitPublicFeedback(
  input: unknown,
  source: unknown = "PUBLIC_FEEDBACK",
): Promise<FeedbackReceipt> {
  try {
    await consumeFeedbackBudget();

    const trustedSource = publicFeedbackSourceSchema.safeParse(source);
    if (!trustedSource.success) {
      throw new FeedbackError("Feedback source is invalid", "INVALID_INPUT");
    }

    const parsed = parseSubmission(input);
    return await persistSubmission(
      parsed,
      trustedSource.data,
      "PUBLIC_SELF_REPORTED_CUSTOMER",
    );
  } catch (error) {
    throw sanitizeFeedbackError("submit public feedback", error);
  }
}

/**
 * Records feedback from an authenticated Provider member. Membership is
 * resolved first; the abuse budget is shared with the public submission budget.
 */
export async function submitProviderFeedback(
  input: unknown,
): Promise<FeedbackReceipt> {
  try {
    let context: ProviderContext;
    try {
      context = await requireProviderContext();
    } catch (error) {
      throw providerAccessError(error);
    }

    await consumeFeedbackBudget();
    const parsed = parseSubmission(input);

    return await persistSubmission(
      parsed,
      "PROVIDER_WORKSPACE",
      providerParticipantClass(context),
    );
  } catch (error) {
    throw sanitizeFeedbackError("submit provider feedback", error);
  }
}

/**
 * Applies one reviewer decision atomically. The operator guard runs before any
 * input is parsed. The expected version is a precondition; the database
 * rechecks it under lock. Original submitted text is never written.
 */
export async function recordFeedbackReview(
  feedbackId: unknown,
  decision: unknown,
  expectedRowVersion: unknown,
): Promise<FeedbackReviewResult> {
  try {
    const access = await requireInternalOperator();
    if (access.status === "UNAVAILABLE") {
      throw new FeedbackError(
        "Feedback is unavailable. Please try again.",
        "UNAVAILABLE",
      );
    }
    if (access.status !== "ALLOWED") {
      throw new FeedbackError("Internal access is not available", "FORBIDDEN");
    }

    const id = feedbackIdSchema.safeParse(feedbackId);
    const version = expectedRowVersionSchema.safeParse(expectedRowVersion);
    const parsed = feedbackReviewDecisionSchema.safeParse(decision);
    if (!id.success || !version.success || !parsed.success) {
      throw new FeedbackError("Review details are invalid", "INVALID_INPUT");
    }

    const client = await createInternalOpsClient();
    const current = await readFeedbackCurrentState(client, id.data);
    if (!current) {
      throw new FeedbackError("Feedback was not found", "NOT_FOUND");
    }
    if (current.rowVersion !== version.data) {
      throw new FeedbackError(
        "This feedback changed since it was opened. Reload and review again.",
        "CONFLICT",
      );
    }

    const { status, priority, internalNotes, linkedIssueUrl, reason } =
      parsed.data;
    if (!ALLOWED_STATUS_MOVES[current.status].includes(status)) {
      throw new FeedbackError(
        "This review change is not allowed",
        "INVALID_INPUT",
      );
    }
    const reopening =
      status === "REVIEWING" &&
      (current.status === "RESOLVED" || current.status === "DISMISSED");
    if (reopening && !reason) {
      throw new FeedbackError(
        "A reason is required to reopen this feedback",
        "INVALID_INPUT",
      );
    }

    return await recordFeedbackReviewRecord(client, {
      feedbackId: id.data,
      operatorUserId: access.userId,
      expectedRowVersion: version.data,
      status,
      priority,
      internalNotes,
      linkedIssueUrl,
      reason,
    });
  } catch (error) {
    throw sanitizeFeedbackError("record feedback review", error);
  }
}
