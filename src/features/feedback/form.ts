import "server-only";

import { sanitizeFeedbackError } from "./errors";
import { submitFeedbackSchema } from "./schemas";
import type {
  FeedbackFormField,
  FeedbackFormState,
  FeedbackReceipt,
} from "./types";

const FORM_FIELDS: readonly FeedbackFormField[] = [
  "category",
  "title",
  "message",
];

// #87 §3.6 proposal (owner approval pending). Validation copy lives in the
// submission schema so the field errors and this mapping cannot drift.
const REJECTION_COPY = {
  RATE_LIMITED: "Too many submissions. Wait a few minutes and try again.",
  UNAVAILABLE: "Feedback is temporarily unavailable. Try again later.",
  FORBIDDEN: "Sign in to your Provider account to send feedback.",
} as const;

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Adapts one participant form post to a Feedback submission. Only the form
 * fields and nonce are read, so a forged source, class or identity field never
 * reaches the operation. The operation owns the rate budget, validation,
 * trusted source/class and persistence; field errors are derived only after it
 * has rejected the input, so they never bypass that budget.
 */
export async function submitFeedbackForm(
  formData: FormData,
  submit: (input: unknown) => Promise<FeedbackReceipt>,
): Promise<FeedbackFormState> {
  const values = {
    category: formText(formData, "category"),
    title: formText(formData, "title"),
    message: formText(formData, "message"),
  };
  const submittedNonce = formText(formData, "submissionNonce");

  try {
    await submit({ ...values, submissionNonce: submittedNonce });
    return { status: "accepted", nextNonce: crypto.randomUUID() };
  } catch (caught) {
    const error = sanitizeFeedbackError("submit feedback form", caught);
    // A malformed nonce never reached persistence, so a fresh one is safe;
    // a valid one is kept so retrying a possibly committed attempt is a no-op.
    const nonce = submitFeedbackSchema.shape.submissionNonce.safeParse(
      submittedNonce,
    ).success
      ? submittedNonce
      : crypto.randomUUID();

    if (error.code === "INVALID_INPUT") {
      const fieldErrors: Partial<Record<FeedbackFormField, string>> = {};
      const parsed = submitFeedbackSchema.safeParse({
        ...values,
        submissionNonce: nonce,
      });
      for (const issue of parsed.error?.issues ?? []) {
        const field = FORM_FIELDS.find((name) => name === issue.path[0]);
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      return {
        status: "rejected",
        reason: "INVALID_INPUT",
        message: error.message,
        fieldErrors,
        values,
        nonce,
      };
    }

    const reason =
      error.code === "RATE_LIMITED" || error.code === "FORBIDDEN"
        ? error.code
        : "UNAVAILABLE";
    return {
      status: "rejected",
      reason,
      message: REJECTION_COPY[reason],
      fieldErrors: {},
      values,
      nonce,
    };
  }
}
