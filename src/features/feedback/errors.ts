import { FeedbackError } from "./types";

const UNAVAILABLE_MESSAGE = "Feedback is unavailable. Please try again.";

// Only SQLSTATE-shaped codes are logged. Messages, SQL text, and input never
// reach logs, so a failing query cannot leak submitted feedback.
const LOGGABLE_CODE = /^[A-Z0-9]{5,8}$/;

function loggableCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    LOGGABLE_CODE.test(error.code)
  ) {
    return error.code;
  }
  return "unknown";
}

export function feedbackUnavailable(
  operation: string,
  error?: unknown,
): FeedbackError {
  console.error(`[FEEDBACK_FAILURE] ${operation} failed`, {
    code: loggableCode(error),
    timestamp: new Date().toISOString(),
  });
  return new FeedbackError(UNAVAILABLE_MESSAGE, "UNAVAILABLE");
}

// Feature-entry boundary: intentional FeedbackErrors keep their fixed codes;
// anything else (transport, client creation, malformed responses) becomes
// UNAVAILABLE with no original message attached.
export function sanitizeFeedbackError(
  operation: string,
  error: unknown,
): FeedbackError {
  if (error instanceof FeedbackError) {
    return error;
  }
  return feedbackUnavailable(operation, error);
}
