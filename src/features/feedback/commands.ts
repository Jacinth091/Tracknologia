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

// The shared public and Provider budget runs before any input is parsed, so a
// denied or failed limiter never reaches validation or persistence.
async function consumeFeedbackBudget(): Promise<void> {
  let limit;
  try {
    limit = await checkClientRateLimit("feedback_submit");
  } catch (error) {
    console.error("[FEEDBACK_FAILURE] abuse control unavailable", {
      name: error instanceof Error ? error.name : "unknown",
      timestamp: new Date().toISOString(),
    });
    throw new FeedbackError(
      "Feedback is unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }

  if (!limit.allowed) {
    throw new FeedbackError(
      "Too many feedback submissions from this connection. Please try again later.",
      "RATE_LIMITED",
      limit.retryAfterSeconds,
    );
  }
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

  try {
    await insertFeedbackSubmission(await createPublicOperationClient(), record);
  } catch (error) {
    if (error instanceof FeedbackError) {
      throw error;
    }
    console.error("[FEEDBACK_FAILURE] submission client failed", {
      name: error instanceof Error ? error.name : "unknown",
      timestamp: new Date().toISOString(),
    });
    throw new FeedbackError(
      "Feedback is unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }

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

/**
 * Records anonymous feedback from a public surface. The caller supplies the
 * trusted source (validated against the public allow-list); participant class
 * is always PUBLIC_SELF_REPORTED_CUSTOMER.
 */
export async function submitPublicFeedback(
  input: unknown,
  source: PublicFeedbackSource = "PUBLIC_FEEDBACK",
): Promise<FeedbackReceipt> {
  const trustedSource = publicFeedbackSourceSchema.parse(source);

  await consumeFeedbackBudget();
  const parsed = parseSubmission(input);

  return persistSubmission(
    parsed,
    trustedSource,
    "PUBLIC_SELF_REPORTED_CUSTOMER",
  );
}

/**
 * Records feedback from an authenticated Provider member. Membership is
 * resolved first; the abuse budget is shared with the public submission budget.
 */
export async function submitProviderFeedback(
  input: unknown,
): Promise<FeedbackReceipt> {
  let context;
  try {
    context = await requireProviderContext();
  } catch (error) {
    if (error instanceof AuthError && error.code === "INFRASTRUCTURE_FAILURE") {
      throw new FeedbackError(
        "Feedback is unavailable. Please try again.",
        "UNAVAILABLE",
      );
    }
    throw new FeedbackError(
      "Provider access is required to send this feedback",
      "FORBIDDEN",
    );
  }

  await consumeFeedbackBudget();
  const parsed = parseSubmission(input);

  return persistSubmission(
    parsed,
    "PROVIDER_WORKSPACE",
    providerParticipantClass(context),
  );
}

/**
 * Applies one reviewer decision atomically. The reviewer is the verified
 * internal operator; the expected version guards against overwriting a newer
 * review. Original submitted text is never written.
 */
export async function recordFeedbackReview(
  feedbackId: unknown,
  decision: unknown,
  expectedRowVersion: unknown,
): Promise<FeedbackReviewResult> {
  const id = feedbackIdSchema.safeParse(feedbackId);
  const version = expectedRowVersionSchema.safeParse(expectedRowVersion);
  const parsed = feedbackReviewDecisionSchema.safeParse(decision);
  if (!id.success || !version.success || !parsed.success) {
    throw new FeedbackError("Review details are invalid", "INVALID_INPUT");
  }

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
  const reopening =
    status === "REVIEWING" &&
    (current.status === "RESOLVED" || current.status === "DISMISSED");
  if (!ALLOWED_STATUS_MOVES[current.status].includes(status)) {
    throw new FeedbackError(
      "This review change is not allowed",
      "INVALID_INPUT",
    );
  }
  if (reopening && !reason) {
    throw new FeedbackError(
      "A reason is required to reopen this feedback",
      "INVALID_INPUT",
    );
  }

  return recordFeedbackReviewRecord(client, {
    feedbackId: id.data,
    operatorUserId: access.userId,
    expectedRowVersion: version.data,
    status,
    priority,
    internalNotes,
    linkedIssueUrl,
    reason,
  });
}
