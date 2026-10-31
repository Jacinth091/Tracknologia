import { BrandLogo } from "@/components/shared/brand-logo";
import { FeedbackPrivacyNotice } from "@/features/feedback/ui/feedback-privacy-notice";
import type { Metadata } from "next";
import Link from "next/link";

// Placeholder until the owner's team address is approved. Replace it before push.
const PRIVACY_CONTACT_EMAIL = "TODO-OWNER-EMAIL@example.invalid";

export const metadata: Metadata = {
  title: "Privacy — Tracknologia",
  description:
    "What Tracknologia keeps for feedback, repair requests, tracking and Provider accounts, and who can see it.",
};

const SECTION_HEADING_CLASS =
  "text-lg font-bold tracking-tight text-foreground";
const SECTION_BODY_CLASS =
  "mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0">
            <BrandLogo />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              How Tracknologia handles your information
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Tracknologia is a school project that helps repair shops and
              independent repairers track repairs during a small pilot in
              November 2026. This page explains what we keep and who can see
              it.
            </p>
          </div>

          <section aria-labelledby="privacy-feedback">
            <h2 id="privacy-feedback" className={SECTION_HEADING_CLASS}>
              1. Feedback (approved 2026-10-30, unchanged)
            </h2>
            <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <FeedbackPrivacyNotice />
            </div>
          </section>

          <section aria-labelledby="privacy-repairs">
            <h2 id="privacy-repairs" className={SECTION_HEADING_CLASS}>
              2. Repair requests and repairs (customers)
            </h2>
            <div className={SECTION_BODY_CLASS}>
              <p>
                <strong>What we collect:</strong> your name and phone number,
                your email if you give it, your device type and details, the
                problem you describe, and how you want the repair arranged
                (drop-off, meetup, home service or other) with any details you
                add.
              </p>
              <p>
                <strong>Who can see it:</strong> the repair shop or repairer
                you sent it to, and their staff. The Tracknologia team can see
                it to keep the service running. Other shops and repairers
                can&apos;t.
              </p>
              <p>
                <strong>How long we keep it:</strong> for as long as that shop
                or repairer uses Tracknologia. If they leave, their repair
                records are deleted. Copies may stay in backups for a limited
                time.
              </p>
            </div>
          </section>

          <section aria-labelledby="privacy-tracking">
            <h2 id="privacy-tracking" className={SECTION_HEADING_CLASS}>
              3. Tracking a repair
            </h2>
            <div className={SECTION_BODY_CLASS}>
              <p>
                Anyone with your tracking code can see your repair&apos;s
                status, the device, the problem you described, the updates the
                shop writes for you and the shop&apos;s name. They can&apos;t
                see your name or phone number.{" "}
                <strong>Keep your tracking code private.</strong>
              </p>
              <p>
                When a tracking page is viewed, we record only the time, to
                count how often tracking is used. We keep that for as long as
                the repair. To stop abuse, we limit lookups with a temporary
                coded key, not your IP address.
              </p>
            </div>
          </section>

          <section aria-labelledby="privacy-providers">
            <h2 id="privacy-providers" className={SECTION_HEADING_CLASS}>
              4. Repair shops and repairers (Provider accounts)
            </h2>
            <div className={SECTION_BODY_CLASS}>
              <p>
                <strong>What we collect:</strong> your email and password
                (handled by our sign-in provider), your name, and the shop
                details you enter. Your shop&apos;s public page shows only what
                you choose to publish there, such as its name and address.
              </p>
              <p>
                <strong>Who can see it:</strong> you, the staff you invite, and
                the Tracknologia team. Your public page can be seen by anyone
                with its link.
              </p>
              <p>
                <strong>How long we keep it:</strong> while your account
                exists. To delete your account and your shop&apos;s data, email
                the Tracknologia team (below). We do it within 30 days. Copies
                may stay in backups for a limited time.
              </p>
            </div>
          </section>

          <section aria-labelledby="privacy-contact">
            <h2 id="privacy-contact" className={SECTION_HEADING_CLASS}>
              5. Who we are and how to reach us
            </h2>
            <div className={SECTION_BODY_CLASS}>
              <p>
                Questions about your information: email the Tracknologia team
                at{" "}
                <a
                  href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  {PRIVACY_CONTACT_EMAIL}
                </a>
                .
              </p>
              <p>
                We review this page if the way Tracknologia handles information
                changes. Last updated: 31 October 2026.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
