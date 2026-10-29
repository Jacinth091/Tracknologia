// Server-only Interface for src/features/feedback. Route adapters pass only
// browser input; trusted identity, source, and reviewer come from the
// server-side guards inside these functions. Client code imports the
// client-safe schemas and types directly from ./schemas and ./types.
import "server-only";

export {
  submitPublicFeedback,
  submitProviderFeedback,
  recordFeedbackReview,
} from "./commands";

export {
  getFeedbackAggregateSummary,
  getInternalFeedback,
  listInternalFeedback,
} from "./queries";

export {
  FeedbackError,
  type FeedbackCountSummary,
  type FeedbackDetail,
  type FeedbackErrorCode,
  type FeedbackPreview,
  type FeedbackPreviewPage,
  type FeedbackReceipt,
  type FeedbackReviewResult,
  type PublicFeedbackSource,
} from "./types";
