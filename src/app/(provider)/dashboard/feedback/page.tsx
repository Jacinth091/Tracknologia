import type { Metadata } from "next";

import { requireProviderContext } from "@/features/auth";
import { FeedbackForm } from "@/features/feedback/ui/feedback-form";

import { PageHeader } from "../_components/page-header";
import { submitProviderFeedbackAction } from "./actions";

export const metadata: Metadata = {
  title: "Send feedback — Tracknologia",
  description: "Tell the Tracknologia team what is working and what isn't.",
};

export default async function ProviderFeedbackPage() {
  // Membership is required to render; the action re-derives it on submit.
  await requireProviderContext();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Provider"
        title="Send feedback"
        description="Tell the Tracknologia team what is working and what isn't. Only the team can read it."
      />

      <FeedbackForm
        action={submitProviderFeedbackAction}
        initialNonce={crypto.randomUUID()}
      />
    </div>
  );
}
