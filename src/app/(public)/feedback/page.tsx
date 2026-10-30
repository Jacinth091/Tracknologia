import { BrandLogo } from "@/components/shared/brand-logo";
import { FeedbackForm } from "@/features/feedback/ui/feedback-form";
import type { Metadata } from "next";
import Link from "next/link";
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
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0">
            <BrandLogo />
          </Link>
          <Link
            href="/track"
            className="px-2 py-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Track a repair
          </Link>
        </div>
      </header>

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
    </div>
  );
}
