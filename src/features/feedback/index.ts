// Public Interface for src/features/feedback. Route adapters pass only
// browser input; trusted identity, source, and reviewer come from the
// server-side guards inside these functions.
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
  feedbackIdSchema,
  feedbackReviewDecisionSchema,
  submitFeedbackSchema,
  type FeedbackReviewDecisionInput,
  type SubmitFeedbackInput,
} from "./schemas";

export {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  FeedbackError,
  PUBLIC_FEEDBACK_SOURCES,
  type FeedbackCategory,
  type FeedbackCountSummary,
  type FeedbackDetail,
  type FeedbackErrorCode,
  type FeedbackParticipantClass,
  type FeedbackPreview,
  type FeedbackPreviewPage,
  type FeedbackPriority,
  type FeedbackReceipt,
  type FeedbackReviewResult,
  type FeedbackSource,
  type FeedbackStatus,
  type PublicFeedbackSource,
} from "./types";
