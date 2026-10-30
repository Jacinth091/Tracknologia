"use server";

import {
  submitFeedbackForm,
  submitPublicFeedback,
  type FeedbackFormState,
} from "@/features/feedback";

export async function submitPublicFeedbackAction(
  _previousState: FeedbackFormState | null,
  formData: FormData,
): Promise<FeedbackFormState> {
  // The default source is PUBLIC_FEEDBACK: this canonical page is the only
  // public entry, and entry links carry no origin payload.
  return submitFeedbackForm(formData, (input) => submitPublicFeedback(input));
}
