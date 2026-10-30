export const FEEDBACK_CATEGORIES = [
  "BUG",
  "USABILITY",
  "FEATURE_REQUEST",
  "GENERAL",
] as const;

export const FEEDBACK_STATUSES = [
  "NEW",
  "REVIEWING",
  "PLANNED",
  "RESOLVED",
  "DISMISSED",
] as const;

export const FEEDBACK_PRIORITIES = ["NORMAL", "HIGH", "CRITICAL"] as const;

// Source is the trusted surface that produced the submission. Public sources
// are chosen by the server adapter, never by the browser.
export const PUBLIC_FEEDBACK_SOURCES = [
  "PUBLIC_TRACKING",
  "PUBLIC_REQUEST",
  "PUBLIC_FEEDBACK",
] as const;

export const FEEDBACK_SOURCES = [
  ...PUBLIC_FEEDBACK_SOURCES,
  "PROVIDER_WORKSPACE",
] as const;

export const FEEDBACK_PARTICIPANT_CLASSES = [
  "PUBLIC_SELF_REPORTED_CUSTOMER",
  "SHOP_OWNER",
  "SHOP_STAFF",
  "INDEPENDENT_REPAIRER",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type FeedbackPriority = (typeof FEEDBACK_PRIORITIES)[number];
export type PublicFeedbackSource = (typeof PUBLIC_FEEDBACK_SOURCES)[number];
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
export type FeedbackParticipantClass =
  (typeof FEEDBACK_PARTICIPANT_CLASSES)[number];

/** Submitted by a Customer or Provider user. Receipt has no lookup handle. */
export interface FeedbackReceipt {
  accepted: true;
}

export interface FeedbackPreview {
  id: string;
  category: FeedbackCategory;
  source: FeedbackSource;
  participantClass: FeedbackParticipantClass;
  title: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  rowVersion: number;
  createdAt: string;
  reviewedAt: string | null;
  // Computed server-side from title and message. The message itself never
  // leaves the persistence layer.
  mayContainContactDetails: boolean;
}

export interface FeedbackPreviewPage {
  items: FeedbackPreview[];
  nextCursor: string | null;
}

export interface FeedbackOriginal {
  id: string;
  category: FeedbackCategory;
  source: FeedbackSource;
  participantClass: FeedbackParticipantClass;
  title: string | null;
  message: string;
  createdAt: string;
}

export interface FeedbackReview {
  status: FeedbackStatus;
  priority: FeedbackPriority;
  internalNotes: string | null;
  linkedIssueUrl: string | null;
  rowVersion: number;
  reviewedAt: string | null;
}

export interface FeedbackHistoryEvent {
  eventId: string;
  fromStatus: FeedbackStatus;
  toStatus: FeedbackStatus;
  priorityBefore: FeedbackPriority;
  priorityAfter: FeedbackPriority;
  rowVersion: number;
  reason: string | null;
  occurredAt: string;
}

export interface FeedbackDetail {
  original: FeedbackOriginal;
  review: FeedbackReview;
  history: {
    items: FeedbackHistoryEvent[];
    truncated: boolean;
  };
}

export interface FeedbackReviewResult {
  status: FeedbackStatus;
  priority: FeedbackPriority;
  rowVersion: number;
}

// Summary periods are Asia/Manila calendar days. Manila keeps no daylight
// saving time, so the conversion to UTC instants is a fixed +08:00 offset.
export interface FeedbackSummaryWindowLabel {
  timeZone: "Asia/Manila";
  startDate: string;
  endDateExclusive: string;
  days: number;
}

/** Count-only summary. Coverage is limited to rows still retained. */
export interface FeedbackCountSummary {
  asOf: string;
  window: FeedbackSummaryWindowLabel;
  snapshot: "CURRENT_STATUS";
  retention: { policy: "UNAPPROVED"; coverage: "RETAINED_ROWS_ONLY" };
  total: number;
  byCategory: Record<FeedbackCategory, number>;
  bySource: Record<FeedbackSource, number>;
  byStatus: Record<FeedbackStatus, number>;
  daily: Array<{ date: string; count: number }>;
}

export type FeedbackFormField = "category" | "title" | "message";

/**
 * Participant form outcome. A rejected attempt echoes only the allow-listed
 * fields and keeps its nonce so a retry stays idempotent; acceptance carries
 * a fresh nonce for the next submission and nothing about the stored row.
 */
export type FeedbackFormState =
  | { status: "accepted"; nextNonce: string }
  | {
      status: "rejected";
      reason: "INVALID_INPUT" | "RATE_LIMITED" | "UNAVAILABLE" | "FORBIDDEN";
      message: string;
      fieldErrors: Partial<Record<FeedbackFormField, string>>;
      values: Record<FeedbackFormField, string>;
      nonce: string;
    };

export type FeedbackErrorCode =
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT";

export class FeedbackError extends Error {
  constructor(
    message: string,
    public readonly code: FeedbackErrorCode,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "FeedbackError";
  }
}
