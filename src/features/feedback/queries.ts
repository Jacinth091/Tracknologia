import "server-only";

import {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "@/features/internal-operations/access";
import { createInternalOpsClient } from "@/lib/supabase/internal";

import {
  listFeedbackPreviews,
  buildFeedbackCountSummary,
  readFeedbackDetail,
  readFeedbackSummaryRows,
} from "./persistence";
import {
  feedbackIdSchema,
  feedbackListOptionsSchema,
  feedbackSummaryWindowSchema,
} from "./schemas";
import {
  FeedbackError,
  type FeedbackCountSummary,
  type FeedbackDetail,
  type FeedbackPreviewPage,
} from "./types";

const DAY_MS = 86_400_000;

// Every internal read passes the operator guard and the required access audit
// before the privileged query. Any denial or audit failure stops here, so no
// protected data is queried for an unauthorized or unrecorded request.
async function requireAuditedOperatorRead(): Promise<string> {
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

  const audited = await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW");
  if (!audited) {
    throw new FeedbackError(
      "Feedback is unavailable. Please try again.",
      "UNAVAILABLE",
    );
  }

  return access.userId;
}

/**
 * Bounded preview list for internal reviewers. Previews never include the
 * original message, internal notes, or the submission nonce.
 */
export async function listInternalFeedback(
  options: unknown = {},
): Promise<FeedbackPreviewPage> {
  await requireAuditedOperatorRead();

  const parsed = feedbackListOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new FeedbackError("Feedback filters are invalid", "INVALID_INPUT");
  }

  return listFeedbackPreviews(await createInternalOpsClient(), parsed.data);
}

/**
 * Original submission plus separate review state and bounded history. Returns
 * null for a malformed or unknown identifier.
 */
export async function getInternalFeedback(
  feedbackId: unknown,
): Promise<FeedbackDetail | null> {
  await requireAuditedOperatorRead();

  const id = feedbackIdSchema.safeParse(feedbackId);
  if (!id.success) {
    return null;
  }

  return readFeedbackDetail(await createInternalOpsClient(), id.data);
}

/**
 * Count-only summary of submissions created in a UTC window (end exclusive,
 * at most 31 days). Status counts are a current snapshot, and coverage is
 * limited to rows still retained.
 */
export async function getFeedbackAggregateSummary(
  window: unknown,
): Promise<FeedbackCountSummary> {
  const operatorUserId = await requireAuditedOperatorRead();

  const parsed = feedbackSummaryWindowSchema.safeParse(window);
  if (!parsed.success) {
    throw new FeedbackError(
      parsed.error.issues[0]?.message ?? "Summary window is invalid",
      "INVALID_INPUT",
    );
  }

  const { startDate, endDateExclusive } = parsed.data;
  const days = Math.round(
    (Date.parse(endDateExclusive) - Date.parse(startDate)) / DAY_MS,
  );
  const range = {
    start: `${startDate}T00:00:00.000Z`,
    endExclusive: `${endDateExclusive}T00:00:00.000Z`,
  };

  const rows = await readFeedbackSummaryRows(
    await createInternalOpsClient(),
    operatorUserId,
    range,
  );

  return buildFeedbackCountSummary(
    rows,
    { startDate, endDateExclusive, days },
    new Date().toISOString(),
  );
}
