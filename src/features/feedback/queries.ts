import "server-only";

import {
  recordSensitiveInternalAccess,
  requireInternalOperator,
} from "@/features/internal-operations/access";
import { createInternalOpsClient } from "@/lib/supabase/internal";

import { sanitizeFeedbackError } from "./errors";
import {
  countNewFeedback,
  listFeedbackPreviews,
  readFeedbackDetail,
  readFeedbackSummaryRows,
  type FeedbackSummaryRow,
} from "./persistence";
import {
  feedbackIdSchema,
  feedbackListOptionsSchema,
  feedbackSummaryWindowSchema,
} from "./schemas";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  FeedbackError,
  type FeedbackCountSummary,
  type FeedbackDetail,
  type FeedbackPreviewPage,
} from "./types";

const DAY_MS = 86_400_000;

// Every internal read passes the operator guard and the required access audit
// before the privileged query. Denial or audit failure stops here, so no
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

/** Current NEW backlog across all retained submissions, without a date window. */
export async function getNewFeedbackCount(): Promise<number> {
  try {
    await requireAuditedOperatorRead();
    return await countNewFeedback(await createInternalOpsClient());
  } catch (error) {
    throw sanitizeFeedbackError("count internal new feedback", error);
  }
}

/**
 * Bounded preview list for internal reviewers. Previews never include the
 * original message, internal notes, or the submission nonce.
 */
export async function listInternalFeedback(
  options: unknown = {},
): Promise<FeedbackPreviewPage> {
  try {
    await requireAuditedOperatorRead();

    const parsed = feedbackListOptionsSchema.safeParse(options);
    if (!parsed.success) {
      throw new FeedbackError("Feedback filters are invalid", "INVALID_INPUT");
    }

    return await listFeedbackPreviews(
      await createInternalOpsClient(),
      parsed.data,
    );
  } catch (error) {
    throw sanitizeFeedbackError("list internal feedback", error);
  }
}

/**
 * Original submission plus separate review state and bounded history. Returns
 * null for a malformed or unknown identifier.
 */
export async function getInternalFeedback(
  feedbackId: unknown,
): Promise<FeedbackDetail | null> {
  try {
    await requireAuditedOperatorRead();

    const id = feedbackIdSchema.safeParse(feedbackId);
    if (!id.success) {
      return null;
    }

    return await readFeedbackDetail(await createInternalOpsClient(), id.data);
  } catch (error) {
    throw sanitizeFeedbackError("read internal feedback", error);
  }
}

// Asia/Manila has no daylight saving time, so a fixed +08:00 offset converts
// its calendar-day boundaries to the UTC instants the database compares with.
const MANILA_OFFSET = "+08:00";

function manilaMidnightUtc(date: string): string {
  return new Date(`${date}T00:00:00${MANILA_OFFSET}`).toISOString();
}

/**
 * Count-only summary of submissions created in Asia/Manila calendar days (start
 * inclusive, end exclusive, at most 31 days). Status counts are a current
 * snapshot, and coverage is limited to rows still retained.
 */
export async function getFeedbackAggregateSummary(
  window: unknown,
): Promise<FeedbackCountSummary> {
  try {
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
    const rows = await readFeedbackSummaryRows(
      await createInternalOpsClient(),
      operatorUserId,
      {
        start: manilaMidnightUtc(startDate),
        endExclusive: manilaMidnightUtc(endDateExclusive),
      },
    );

    return buildFeedbackCountSummary(
      rows,
      { timeZone: "Asia/Manila", startDate, endDateExclusive, days },
      new Date().toISOString(),
    );
  } catch (error) {
    throw sanitizeFeedbackError("summarize internal feedback", error);
  }
}

/**
 * Projects fixed count groups into the summary shape. Missing groups are
 * zero-filled, and every calendar day in the window appears exactly once.
 */
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
    retention: { policy: "APPROVED", coverage: "RETAINED_ROWS_ONLY" },
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
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}
