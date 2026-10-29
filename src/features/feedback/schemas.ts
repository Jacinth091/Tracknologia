import { z } from "zod";

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  PUBLIC_FEEDBACK_SOURCES,
} from "./types";

// Mirrors the feedback_submissions CHECK constraints: edge trimming covers only
// ASCII space, tab, LF, CR, FF, and VT, and length counts code points.
const ASCII_EDGE_WHITESPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

export function asciiTrim(value: string): string {
  return value.replace(ASCII_EDGE_WHITESPACE, "");
}

function codePointLength(value: string): number {
  return [...value].length;
}

// U+0001-U+0008, U+000E-U+001F, and U+007F are rejected; TAB, LF, VT, FF,
// and CR are permitted inside participant text.
function hasForbiddenControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
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

// Optional fields: absent or blank input becomes null, so the stored value
// is either a bounded non-blank string or NULL, matching the table.
function optionalBoundedText(min: number, max: number, label: string) {
  return z
    .string()
    .optional()
    .transform((value) => asciiTrim(value ?? ""))
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

const TRACKED_ISSUE_PATH = /^\/Jacinth091\/Tracknologia\/issues\/[1-9][0-9]*$/;

// Accepts only canonical https://github.com/<repo>/issues/<n> links with no
// credentials, port, query, or fragment. The stored value is the normalized href.
function canonicalTrackedIssueUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const allowed =
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    url.search === "" &&
    url.hash === "" &&
    TRACKED_ISSUE_PATH.test(url.pathname);

  return allowed ? url.href : null;
}

const linkedIssueUrlSchema = z
  .string()
  .optional()
  .transform((value) => asciiTrim(value ?? ""))
  .refine(
    (value) => value === "" || canonicalTrackedIssueUrl(value) !== null,
    "Linked issue must be a GitHub issue link for this repository",
  )
  .transform((value) =>
    value === "" ? null : canonicalTrackedIssueUrl(value),
  );

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
  internalNotes: optionalBoundedText(1, 2000, "Internal notes"),
  linkedIssueUrl: linkedIssueUrlSchema,
  reason: optionalBoundedText(3, 500, "Reason"),
});

export type FeedbackReviewDecisionInput = z.output<
  typeof feedbackReviewDecisionSchema
>;

export const expectedRowVersionSchema = z.number().int().positive();

// Keyset cursor: "<created_at>|<id>" as returned by PostgREST. The character
// set excludes filter-syntax characters, so it is safe in an .or() filter.
const feedbackCursorSchema = z
  .string()
  .regex(/^[0-9T:.+\-Z]{10,40}\|[0-9a-f-]{36}$/, "Feedback cursor is invalid");

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
  }, "Summary window must cover 1 to 31 UTC days");

export type FeedbackSummaryWindow = z.output<
  typeof feedbackSummaryWindowSchema
>;
