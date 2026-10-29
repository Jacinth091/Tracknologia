import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  FeedbackCategory,
  FeedbackCountSummary,
  FeedbackDetail,
  FeedbackHistoryEvent,
  FeedbackListOptions,
  FeedbackParticipantClass,
  FeedbackPreview,
  FeedbackPriority,
  FeedbackReviewResult,
  FeedbackSource,
  FeedbackStatus,
  FeedbackPreviewPage,
} from "./types";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  FeedbackError,
} from "./types";

const FEEDBACK_PAGE_SIZE = 50;
const FEEDBACK_HISTORY_LIMIT = 100;

const PREVIEW_COLUMNS =
  "id, category, source, participant_class, title, status, priority, row_version, created_at, reviewed_at";
const DETAIL_COLUMNS =
  "id, category, source, participant_class, title, message, created_at, status, priority, internal_notes, linked_issue_url, row_version, reviewed_at";

interface FeedbackRow {
  id: string;
  category: FeedbackCategory;
  source: FeedbackSource;
  participant_class: FeedbackParticipantClass;
  title: string | null;
  message?: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  internal_notes?: string | null;
  linked_issue_url?: string | null;
  row_version: number;
  created_at: string;
  reviewed_at: string | null;
}

interface FeedbackEventRow {
  event_id: string;
  from_status: FeedbackStatus;
  to_status: FeedbackStatus;
  priority_before: FeedbackPriority;
  priority_after: FeedbackPriority;
  row_version: number;
  reason: string | null;
  occurred_at: string;
}

export interface FeedbackSubmissionRecord {
  nonce: string;
  category: FeedbackCategory;
  source: FeedbackSource;
  participantClass: FeedbackParticipantClass;
  title: string | null;
  message: string;
}

export interface FeedbackReviewRecord {
  feedbackId: string;
  operatorUserId: string;
  expectedRowVersion: number;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  internalNotes: string | null;
  linkedIssueUrl: string | null;
  reason: string | null;
}

// Logs only the SQLSTATE-style code, never the message, row content, or input.
function logFeedbackFailure(operation: string, code: string | undefined) {
  console.error(`[FEEDBACK_FAILURE] ${operation} failed`, {
    code: code ?? "unknown",
    timestamp: new Date().toISOString(),
  });
}

function unavailable(operation: string, code: string | undefined): never {
  logFeedbackFailure(operation, code);
  throw new FeedbackError(
    "Feedback is unavailable. Please try again.",
    "UNAVAILABLE",
  );
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
    unavailable("submit_feedback", error.code);
  }

  // The RPC returns ACCEPTED only after the row is durable (or a same-nonce
  // retry was a no-op). Any other value is not a success.
  if (data !== "ACCEPTED") {
    unavailable("submit_feedback result", undefined);
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
  if (options.cursor) {
    const [cursorTime, cursorId] = options.cursor.split("|");
    query = query.or(
      `created_at.lt."${cursorTime}",and(created_at.eq."${cursorTime}",id.lt.${cursorId})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    unavailable("list feedback", error.code);
  }

  const rows = (data ?? []) as unknown as FeedbackRow[];
  const pageRows = rows.slice(0, FEEDBACK_PAGE_SIZE);
  const last = pageRows.at(-1);

  return {
    items: pageRows.map(mapPreview),
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
    unavailable("read feedback", error.code);
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as FeedbackRow;
  const history = await client
    .from("feedback_review_events")
    .select(
      "event_id, from_status, to_status, priority_before, priority_after, row_version, reason, occurred_at",
    )
    .eq("feedback_id", feedbackId)
    .order("occurred_at", { ascending: true })
    .order("event_id", { ascending: true })
    .limit(FEEDBACK_HISTORY_LIMIT + 1);
  if (history.error) {
    unavailable("read feedback history", history.error.code);
  }

  const events = (history.data ?? []) as unknown as FeedbackEventRow[];

  return {
    original: {
      id: row.id,
      category: row.category,
      source: row.source,
      participantClass: row.participant_class,
      title: row.title,
      message: row.message ?? "",
      createdAt: row.created_at,
    },
    review: {
      status: row.status,
      priority: row.priority,
      internalNotes: row.internal_notes ?? null,
      linkedIssueUrl: row.linked_issue_url ?? null,
      rowVersion: row.row_version,
      reviewedAt: row.reviewed_at,
    },
    history: {
      items: events.slice(0, FEEDBACK_HISTORY_LIMIT).map(mapHistoryEvent),
      truncated: events.length > FEEDBACK_HISTORY_LIMIT,
    },
  };
}

export async function readFeedbackCurrentState(
  client: SupabaseClient,
  feedbackId: string,
): Promise<{ status: FeedbackStatus; rowVersion: number } | null> {
  const { data, error } = await client
    .from("feedback_submissions")
    .select("status, row_version")
    .eq("id", feedbackId)
    .maybeSingle();
  if (error) {
    unavailable("read feedback state", error.code);
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as {
    status: FeedbackStatus;
    row_version: number;
  };
  return { status: row.status, rowVersion: row.row_version };
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
    throw mapReviewError(error.message, error.code);
  }

  if (typeof data !== "number") {
    unavailable("record_feedback_review result", undefined);
  }

  return {
    status: record.status,
    priority: record.priority,
    rowVersion: data,
  };
}

// Maps only the fixed codes raised by the review function. Any other database
// failure becomes a generic UNAVAILABLE without the database text.
function mapReviewError(
  message: string,
  code: string | undefined,
): FeedbackError {
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

  logFeedbackFailure("record_feedback_review", code);
  return new FeedbackError(
    "Feedback is unavailable. Please try again.",
    "UNAVAILABLE",
  );
}

export interface FeedbackSummaryRow {
  dimension: "CATEGORY" | "SOURCE" | "STATUS" | "DAY";
  bucket: string;
  row_count: number;
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
    unavailable("feedback count summary", error.code);
  }

  return (data ?? []) as FeedbackSummaryRow[];
}

export function buildFeedbackCountSummary(
  rows: FeedbackSummaryRow[],
  window: FeedbackCountSummary["window"],
  asOf: string,
): FeedbackCountSummary {
  const byCategory = countsFor(FEEDBACK_CATEGORIES, rows, "CATEGORY");
  const bySource = countsFor(FEEDBACK_SOURCES, rows, "SOURCE");
  const byStatus = countsFor(FEEDBACK_STATUSES, rows, "STATUS");
  const dayCounts = new Map(
    rows
      .filter((row) => row.dimension === "DAY")
      .map((row) => [row.bucket, row.row_count]),
  );

  return {
    asOf,
    window,
    snapshot: "CURRENT_STATUS",
    retention: { policy: "UNAPPROVED", coverage: "RETAINED_ROWS_ONLY" },
    total: Object.values(byCategory).reduce((sum, count) => sum + count, 0),
    byCategory,
    bySource,
    byStatus,
    daily: enumerateDays(window.startDate, window.days).map((date) => ({
      date,
      count: dayCounts.get(date) ?? 0,
    })),
  };
}

function countsFor<T extends string>(
  keys: readonly T[],
  rows: FeedbackSummaryRow[],
  dimension: FeedbackSummaryRow["dimension"],
): Record<T, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<
    T,
    number
  >;
  for (const row of rows) {
    if (
      row.dimension === dimension &&
      (keys as readonly string[]).includes(row.bucket)
    ) {
      counts[row.bucket as T] = row.row_count;
    }
  }
  return counts;
}

function enumerateDays(startDate: string, days: number): string[] {
  const start = Date.parse(startDate);
  return Array.from({ length: days }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
}

function mapPreview(row: FeedbackRow): FeedbackPreview {
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
  };
}

function mapHistoryEvent(row: FeedbackEventRow): FeedbackHistoryEvent {
  return {
    eventId: row.event_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    priorityBefore: row.priority_before,
    priorityAfter: row.priority_after,
    rowVersion: row.row_version,
    reason: row.reason,
    occurredAt: row.occurred_at,
  };
}
