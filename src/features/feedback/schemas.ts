import { z } from "zod";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  PUBLIC_FEEDBACK_SOURCES,
} from "./types";

// Client-safe: import these directly from this file. The feature barrel is
// server-only and does not re-export them.

// Mirrors the feedback_submissions CHECK constraints: edge trimming covers only
// ASCII space, tab, LF, CR, FF, and VT, and length counts code points.
const ASCII_EDGE_WHITESPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function asciiTrim(value: string): string {
  return value.replace(ASCII_EDGE_WHITESPACE, "");
}

function codePointLength(value: string): number {
  return [...value].length;
}

// NUL cannot be stored in PostgreSQL text. U+0001-U+0008, U+000E-U+001F, and
// U+007F are rejected by the table. TAB, LF, VT, FF, and CR remain allowed.
function hasForbiddenControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      code === 0x00 ||
      (code >= 0x01 && code <= 0x08) ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    );
  });
}

function boundedText(min: number, max: number, label: string) {
  return z
    .string()
    .transform(asciiTrim)
    .refine(
      (value) => codePointLength(value) >= min,
      `${label} must be at least ${min} characters`,
    )
    .refine(
      (value) => codePointLength(value) <= max,
      `${label} must be ${max} characters or fewer`,
    )
    .refine(
      (value) => !hasForbiddenControl(value),
      `${label} contains unsupported characters`,
    );
}

// Stored text that can be cleared: blank becomes null, and a non-blank value
// must satisfy the bounds the table enforces for the stored text.
function clearableBoundedText(min: number, max: number, label: string) {
  return z
    .string()
    .transform((value) => asciiTrim(value))
    .refine(
      (value) =>
        value === "" ||
        (codePointLength(value) >= min && codePointLength(value) <= max),
      `${label} must be ${min} to ${max} characters`,
    )
    .refine(
      (value) => !hasForbiddenControl(value),
      `${label} contains unsupported characters`,
    )
    .transform((value) => (value === "" ? null : value));
}

// Optional fields: absent, null, or blank input becomes null.
function optionalBoundedText(min: number, max: number, label: string) {
  return z
    .string()
    .nullish()
    .transform((value) => value ?? "")
    .pipe(clearableBoundedText(min, max, label));
}

// Required key of a full-replacement review. It must be present and hold a
// string or an explicit null. Null or blank clears the stored text; an omitted
// key is rejected before persistence, so a partial decision cannot erase notes.
function requiredClearableText(min: number, max: number, label: string) {
  return z
    .string({ error: `${label} is required; send null to clear it` })
    .nullable()
    .transform((value) => value ?? "")
    .pipe(clearableBoundedText(min, max, label));
}

const TRACKED_ISSUE_PATH = /^\/Jacinth091\/Tracknologia\/issues\/[1-9][0-9]*$/;

// Exact canonical link only: the raw value must equal the parsed href, so
// query strings, fragments, credentials, ports, and alternate spellings are
// rejected rather than normalized into a different stored value.
function isCanonicalTrackedIssueUrl(value: string): boolean {
  if (value.includes("?") || value.includes("#")) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.href === value &&
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    TRACKED_ISSUE_PATH.test(url.pathname)
  );
}

const linkedIssueUrlSchema = z
  .string({ error: "Linked issue is required; send null to clear it" })
  .nullable()
  .transform((value) => asciiTrim(value ?? ""))
  .refine(
    (value) => codePointLength(value) <= 2000,
    "Linked issue must be 2000 characters or fewer",
  )
  .refine(
    (value) => value === "" || isCanonicalTrackedIssueUrl(value),
    "Linked issue must be a GitHub issue link for this repository",
  )
  .transform((value) => (value === "" ? null : value));

const submissionNonceSchema = z.uuid("Feedback could not be verified");

// Browser-facing submission fields only. Source, participant class, status,
// priority, reviewer, and provider/user identity are not accepted here.
export const submitFeedbackSchema = z.strictObject({
  category: z.enum(FEEDBACK_CATEGORIES, {
    error: "Choose a feedback category",
  }),
  title: optionalBoundedText(1, 120, "Title"),
  message: boundedText(1, 2000, "Feedback message"),
  submissionNonce: submissionNonceSchema,
});

export type SubmitFeedbackInput = z.output<typeof submitFeedbackSchema>;

export const publicFeedbackSourceSchema = z.enum(PUBLIC_FEEDBACK_SOURCES);

export const feedbackIdSchema = z.uuid("Feedback ID is invalid");

export const feedbackReviewDecisionSchema = z.strictObject({
  status: z.enum(FEEDBACK_STATUSES),
  priority: z.enum(FEEDBACK_PRIORITIES),
  internalNotes: requiredClearableText(1, 2000, "Internal notes"),
  linkedIssueUrl: linkedIssueUrlSchema,
  reason: optionalBoundedText(3, 500, "Reason"),
});

export type FeedbackReviewDecisionInput = z.output<
  typeof feedbackReviewDecisionSchema
>;

export const expectedRowVersionSchema = z
  .number()
  .int()
  .min(1)
  .max(POSTGRES_INTEGER_MAX);

const CURSOR_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// Keyset cursor "<created_at>|<id>" as PostgREST returns it. Both halves are
// checked semantically before the value can reach a filter.
const feedbackCursorSchema = z.string().refine((value) => {
  const [timestamp, id, ...rest] = value.split("|");
  return (
    rest.length === 0 &&
    timestamp !== undefined &&
    CURSOR_TIMESTAMP.test(timestamp) &&
    !Number.isNaN(Date.parse(timestamp)) &&
    z.uuid().safeParse(id).success
  );
}, "Feedback cursor is invalid");

export const feedbackListOptionsSchema = z.strictObject({
  status: z.enum(FEEDBACK_STATUSES).optional(),
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  source: z.enum(FEEDBACK_SOURCES).optional(),
  cursor: feedbackCursorSchema.optional(),
});

export type FeedbackListOptions = z.output<typeof feedbackListOptionsSchema>;

const utcDateSchema = z.iso.date();

export const feedbackSummaryWindowSchema = z
  .strictObject({
    startDate: utcDateSchema,
    endDateExclusive: utcDateSchema,
  })
  .refine((window) => {
    const days =
      (Date.parse(window.endDateExclusive) - Date.parse(window.startDate)) /
      86_400_000;
    return days >= 1 && days <= 31;
  }, "Summary window must cover 1 to 31 Asia/Manila days");

export type FeedbackSummaryWindow = z.output<
  typeof feedbackSummaryWindowSchema
>;
