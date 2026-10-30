import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { looksLikeContactDetails } from "./contact-details";
import { feedbackUnavailable } from "./errors";
import type { FeedbackListOptions } from "./schemas";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PARTICIPANT_CLASSES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  FeedbackError,
  type FeedbackDetail,
  type FeedbackPreviewPage,
  type FeedbackReviewResult,
} from "./types";

const FEEDBACK_PAGE_SIZE = 50;
const FEEDBACK_HISTORY_LIMIT = 100;
// Privacy review is due once a submission is this old and still unreviewed
// (#87 decision 7, #108).
const FEEDBACK_REVIEW_AGE_DAYS = 90;
const DAY_MS = 86_400_000;

// message is selected only to compute mayContainContactDetails. toPreview
// copies fields one by one, so it never reaches the returned preview.
const PREVIEW_COLUMNS =
  "id, category, source, participant_class, title, message, status, priority, row_version, created_at, reviewed_at";
const DETAIL_COLUMNS =
  "id, category, source, participant_class, title, message, created_at, status, priority, internal_notes, linked_issue_url, row_version, reviewed_at";
const HISTORY_COLUMNS =
  "event_id, from_status, to_status, priority_before, priority_after, row_version, reason, occurred_at";

const positiveVersion = z.number().int().positive();
const timestamp = z.string();

// Compact boundary schemas. Each one selects the fields it needs; z.object
// strips anything else, so no extra column can flow past this file.
const previewRowSchema = z.object({
  id: z.uuid(),
  category: z.enum(FEEDBACK_CATEGORIES),
  source: z.enum(FEEDBACK_SOURCES),
  participant_class: z.enum(FEEDBACK_PARTICIPANT_CLASSES),
  title: z.string().nullable(),
  status: z.enum(FEEDBACK_STATUSES),
  priority: z.enum(FEEDBACK_PRIORITIES),
  row_version: positiveVersion,
  created_at: timestamp,
  reviewed_at: timestamp.nullable(),
});

const previewQueryRowSchema = previewRowSchema.extend({
  message: z.string(),
});

const detailRowSchema = previewRowSchema.extend({
  message: z.string(),
  internal_notes: z.string().nullable(),
  linked_issue_url: z.string().nullable(),
});

const historyRowSchema = z.object({
  event_id: z.uuid(),
  from_status: z.enum(FEEDBACK_STATUSES),
  to_status: z.enum(FEEDBACK_STATUSES),
  priority_before: z.enum(FEEDBACK_PRIORITIES),
  priority_after: z.enum(FEEDBACK_PRIORITIES),
  row_version: positiveVersion,
  reason: z.string().nullable(),
  occurred_at: timestamp,
});

const stateRowSchema = z.object({
  status: z.enum(FEEDBACK_STATUSES),
  row_version: positiveVersion,
});

const summaryRowSchema = z.object({
  dimension: z.enum(["CATEGORY", "SOURCE", "STATUS", "DAY"]),
  bucket: z.string(),
  row_count: z.number().int().nonnegative(),
});

export type FeedbackSummaryRow = z.output<typeof summaryRowSchema>;
export type FeedbackPreviewRow = z.output<typeof previewQueryRowSchema>;

export interface FeedbackSubmissionRecord {
  nonce: string;
  category: (typeof FEEDBACK_CATEGORIES)[number];
  source: (typeof FEEDBACK_SOURCES)[number];
  participantClass: (typeof FEEDBACK_PARTICIPANT_CLASSES)[number];
  title: string | null;
  message: string;
}

export interface FeedbackReviewRecord {
  feedbackId: string;
  operatorUserId: string;
  expectedRowVersion: number;
  status: (typeof FEEDBACK_STATUSES)[number];
  priority: (typeof FEEDBACK_PRIORITIES)[number];
  internalNotes: string | null;
  linkedIssueUrl: string | null;
  reason: string | null;
}

function malformed(operation: string): FeedbackError {
  return feedbackUnavailable(`${operation} response`);
}

export async function insertFeedbackSubmission(
  client: SupabaseClient,
  record: FeedbackSubmissionRecord,
): Promise<void> {
  const { data, error } = await client.rpc("submit_feedback", {
    p_submission_nonce: record.nonce,
    p_category: record.category,
    p_source: record.source,
    p_participant_class: record.participantClass,
    p_title: record.title,
    p_message: record.message,
  });

  if (error) {
    throw feedbackUnavailable("submit_feedback", error);
  }

  // ACCEPTED is returned only after the row is durable (or a same-nonce retry
  // was a no-op). Any other value is not a success.
  if (data !== "ACCEPTED") {
    throw malformed("submit_feedback");
  }
}

export async function listFeedbackPreviews(
  client: SupabaseClient,
  options: FeedbackListOptions,
): Promise<FeedbackPreviewPage> {
  let query = client
    .from("feedback_submissions")
    .select(PREVIEW_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FEEDBACK_PAGE_SIZE + 1);

  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.category) {
    query = query.eq("category", options.category);
  }
  if (options.source) {
    query = query.eq("source", options.source);
  }
  if (options.dueForReview) {
    const reviewCutoff = new Date(
      Date.now() - FEEDBACK_REVIEW_AGE_DAYS * DAY_MS,
    ).toISOString();
    query = query
      .lt("created_at", reviewCutoff)
      .is("privacy_reviewed_at", null);
  }
  if (options.cursor) {
    const [cursorTime, cursorId] = options.cursor.split("|");
    query = query.or(
      `created_at.lt."${cursorTime}",and(created_at.eq."${cursorTime}",id.lt.${cursorId})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw feedbackUnavailable("list feedback", error);
  }

  const parsed = z.array(previewQueryRowSchema).safeParse(data);
  if (!parsed.success) {
    throw malformed("list feedback");
  }

  const rows = parsed.data;
  const pageRows = rows.slice(0, FEEDBACK_PAGE_SIZE);
  const last = pageRows.at(-1);

  return {
    items: pageRows.map(toPreview),
    nextCursor:
      rows.length > FEEDBACK_PAGE_SIZE && last
        ? `${last.created_at}|${last.id}`
        : null,
  };
}

export async function readFeedbackDetail(
  client: SupabaseClient,
  feedbackId: string,
): Promise<FeedbackDetail | null> {
  const { data, error } = await client
    .from("feedback_submissions")
    .select(DETAIL_COLUMNS)
    .eq("id", feedbackId)
    .maybeSingle();
  if (error) {
    throw feedbackUnavailable("read feedback", error);
  }
  // maybeSingle returns null only for an authorized missing row. Any other
  // value, including undefined or a falsy non-null value, is malformed.
  if (data === null) {
    return null;
  }

  const row = detailRowSchema.safeParse(data);
  if (!row.success) {
    throw malformed("read feedback");
  }

  const history = await client
    .from("feedback_review_events")
    .select(HISTORY_COLUMNS)
    .eq("feedback_id", feedbackId)
    .order("row_version", { ascending: false })
    .limit(FEEDBACK_HISTORY_LIMIT + 1);
  if (history.error) {
    throw feedbackUnavailable("read feedback history", history.error);
  }

  const events = z.array(historyRowSchema).safeParse(history.data);
  if (!events.success) {
    throw malformed("read feedback history");
  }

  // The query returns the newest 101 events by version, newest first. Keep the
  // newest 100 and reverse them into causal (ascending version) order.
  const shown = events.data.slice(0, FEEDBACK_HISTORY_LIMIT).reverse();
  return {
    original: {
      id: row.data.id,
      category: row.data.category,
      source: row.data.source,
      participantClass: row.data.participant_class,
      title: row.data.title,
      message: row.data.message,
      createdAt: row.data.created_at,
    },
    review: {
      status: row.data.status,
      priority: row.data.priority,
      internalNotes: row.data.internal_notes,
      linkedIssueUrl: row.data.linked_issue_url,
      rowVersion: row.data.row_version,
      reviewedAt: row.data.reviewed_at,
    },
    history: {
      items: shown.map((event) => ({
        eventId: event.event_id,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        priorityBefore: event.priority_before,
        priorityAfter: event.priority_after,
        rowVersion: event.row_version,
        reason: event.reason,
        occurredAt: event.occurred_at,
      })),
      truncated: events.data.length > FEEDBACK_HISTORY_LIMIT,
    },
  };
}

export async function readFeedbackCurrentState(
  client: SupabaseClient,
  feedbackId: string,
): Promise<{
  status: (typeof FEEDBACK_STATUSES)[number];
  rowVersion: number;
} | null> {
  const { data, error } = await client
    .from("feedback_submissions")
    .select("status, row_version")
    .eq("id", feedbackId)
    .maybeSingle();
  if (error) {
    throw feedbackUnavailable("read feedback state", error);
  }
  if (data === null) {
    return null;
  }

  const state = stateRowSchema.safeParse(data);
  if (!state.success) {
    throw malformed("read feedback state");
  }
  return { status: state.data.status, rowVersion: state.data.row_version };
}

export async function recordFeedbackReviewRecord(
  client: SupabaseClient,
  record: FeedbackReviewRecord,
): Promise<FeedbackReviewResult> {
  const { data, error } = await client.rpc("record_feedback_review", {
    p_feedback_id: record.feedbackId,
    p_operator_user_id: record.operatorUserId,
    p_expected_row_version: record.expectedRowVersion,
    p_target_status: record.status,
    p_target_priority: record.priority,
    p_internal_notes: record.internalNotes,
    p_linked_issue_url: record.linkedIssueUrl,
    p_reason: record.reason,
  });

  if (error) {
    throw mapReviewError(error.message, error);
  }

  // The function returns the version it wrote: exactly one increment over the
  // version the caller expected. Anything else is a malformed response.
  const nextVersion = positiveVersion.safeParse(data);
  if (
    !nextVersion.success ||
    nextVersion.data !== record.expectedRowVersion + 1
  ) {
    throw malformed("record_feedback_review");
  }

  return {
    status: record.status,
    priority: record.priority,
    rowVersion: nextVersion.data,
  };
}

// Maps only the fixed exception tokens raised by the review function. Any
// other database failure becomes a generic UNAVAILABLE without its text.
function mapReviewError(message: string, error: unknown): FeedbackError {
  if (message.includes("FEEDBACK_VERSION_CONFLICT")) {
    return new FeedbackError(
      "This feedback changed since it was opened. Reload and review again.",
      "CONFLICT",
    );
  }
  if (message.includes("FEEDBACK_NOT_FOUND")) {
    return new FeedbackError("Feedback was not found", "NOT_FOUND");
  }
  if (
    message.includes("FEEDBACK_INVALID_TRANSITION") ||
    message.includes("FEEDBACK_REASON_REQUIRED")
  ) {
    return new FeedbackError(
      "This review change is not allowed",
      "INVALID_INPUT",
    );
  }
  if (message.includes("Internal operator access required")) {
    return new FeedbackError("Internal access is not available", "FORBIDDEN");
  }
  return feedbackUnavailable("record_feedback_review", error);
}

export async function readFeedbackSummaryRows(
  client: SupabaseClient,
  operatorUserId: string,
  range: { start: string; endExclusive: string },
): Promise<FeedbackSummaryRow[]> {
  const { data, error } = await client.rpc("get_feedback_count_summary", {
    p_operator_user_id: operatorUserId,
    p_window_start: range.start,
    p_window_end: range.endExclusive,
  });

  if (error) {
    throw feedbackUnavailable("feedback count summary", error);
  }

  const rows = z.array(summaryRowSchema).safeParse(data);
  if (!rows.success) {
    throw malformed("feedback count summary");
  }
  return rows.data;
}

function toPreview(row: FeedbackPreviewRow) {
  return {
    id: row.id,
    category: row.category,
    source: row.source,
    participantClass: row.participant_class,
    title: row.title,
    status: row.status,
    priority: row.priority,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    mayContainContactDetails: looksLikeContactDetails(
      `${row.title ?? ""} ${row.message}`,
    ),
  };
}
