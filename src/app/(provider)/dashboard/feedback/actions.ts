"use server";

import {
  submitFeedbackForm,
  submitProviderFeedback,
  type FeedbackFormState,
} from "@/features/feedback";

export async function submitProviderFeedbackAction(
  _previousState: FeedbackFormState | null,
  formData: FormData,
): Promise<FeedbackFormState> {
  return submitFeedbackForm(formData, submitProviderFeedback);
}
