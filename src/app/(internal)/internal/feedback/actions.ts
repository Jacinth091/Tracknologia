"use server";

import { revalidatePath } from "next/cache";

import { FeedbackError, recordFeedbackReview } from "@/features/feedback";

export interface FeedbackTriageState {
  error?: string;
  success?: string;
  // Latest applied version, so a retry after success targets the new state.
  appliedRowVersion?: number;
}

export async function recordFeedbackReviewAction(
  _previousState: FeedbackTriageState | null,
  formData: FormData,
): Promise<FeedbackTriageState> {
  const feedbackId = formData.get("feedbackId")?.toString() ?? "";
  const expectedRowVersion = Number(formData.get("expectedRowVersion") ?? "");

  // Absent notes or link stay undefined so the feature schema rejects the
  // decision before persistence; a submitted blank field clears the stored text.
  const reviewDecision = {
    status: formData.get("status")?.toString() ?? "",
    priority: formData.get("priority")?.toString() ?? "",
    internalNotes: formData.get("internalNotes")?.toString(),
    linkedIssueUrl: formData.get("linkedIssueUrl")?.toString(),
    reason: formData.get("reason")?.toString(),
  };

  try {
    const result = await recordFeedbackReview(
      feedbackId,
      reviewDecision,
      expectedRowVersion,
    );

    revalidatePath("/internal/feedback");
    revalidatePath(`/internal/feedback/${feedbackId}`);

    return {
      success: "Review saved",
      appliedRowVersion: result.rowVersion,
    };
  } catch (error) {
    if (error instanceof FeedbackError) {
      return {
        error: error.message,
        appliedRowVersion: Number.isSafeInteger(expectedRowVersion)
          ? expectedRowVersion
          : undefined,
      };
    }
    return { error: "Unable to record this review" };
  }
}
