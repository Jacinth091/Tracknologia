import { PublicFooter } from "@/components/shared/public-footer";
import { PublicHeader } from "@/components/shared/public-header";
import { FeedbackForm } from "@/features/feedback/ui/feedback-form";
import type { Metadata } from "next";
import { connection } from "next/server";

import { submitPublicFeedbackAction } from "./actions";

export const metadata: Metadata = {
  title: "Send feedback — Tracknologia",
  description:
    "Tell us what worked, what didn't, or what you'd like. No account needed.",
};

export default async function PublicFeedbackPage() {
  // Each visitor needs their own submission nonce, so never prerender one.
  await connection();
  const initialNonce = crypto.randomUUID();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Send feedback
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Tell us what worked, what didn&apos;t, or what you&apos;d like. No
              account needed.
            </p>
          </div>

          <FeedbackForm
            action={submitPublicFeedbackAction}
            initialNonce={initialNonce}
          />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
