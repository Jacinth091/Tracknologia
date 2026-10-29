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

  // Absent fields arrive as undefined from FormData; send explicit nulls so
  // the feature schema can distinguish "absent" from "clear this field".
  const readField = (name: string) => {
    const value = formData.get(name)?.toString();
    return value === undefined ? null : value;
  };

  const reviewDecision = {
    status: formData.get("status")?.toString() ?? "",
    priority: formData.get("priority")?.toString() ?? "",
    internalNotes: readField("internalNotes"),
    linkedIssueUrl: readField("linkedIssueUrl"),
    reason: readField("reason"),
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
