import type { Metadata } from "next";
import type { ComponentProps, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Message01Icon,
  Search01Icon,
  Store01Icon,
  UserIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/shared/page-header";
import { PublicHeader } from "@/components/shared/public-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackPrivacyNotice } from "@/features/feedback/ui/feedback-privacy-notice";

const PRIVACY_CONTACT_EMAIL = "tracknologia67@gmail.com";

export const metadata: Metadata = {
  title: "Privacy — Tracknologia",
  description:
    "What Tracknologia keeps for feedback, repair requests, tracking and Provider accounts, and who can see it.",
};

const CONTENTS = [
  { id: "privacy-feedback", title: "1. Feedback" },
  {
    id: "privacy-repairs",
    title: "2. Repair requests and repairs (customers)",
  },
  { id: "privacy-tracking", title: "3. Tracking a repair" },
  {
    id: "privacy-providers",
    title: "4. Repair shops and repairers (Provider accounts)",
  },
  { id: "privacy-contact", title: "5. Who we are and how to reach us" },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 sm:py-12">
          <PageHeader
            eyebrow="Privacy"
            title="How Tracknologia handles your information"
            description="Tracknologia is a school project that helps repair shops and independent repairers track repairs during a small pilot in November 2026. This page explains what we keep and who can see it."
          />

          <Card>
            <CardHeader>
              <CardTitle>On this page</CardTitle>
            </CardHeader>
            <CardContent>
              <nav aria-label="On this page">
                <ol className="grid gap-2 text-sm sm:grid-cols-2">
                  {CONTENTS.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </CardContent>
          </Card>

          <PrivacySection
            id="privacy-feedback"
            icon={Message01Icon}
            title="1. Feedback"
          >
            <FeedbackPrivacyNotice />
          </PrivacySection>

          <PrivacySection
            id="privacy-repairs"
            icon={Wrench01Icon}
            title="2. Repair requests and repairs (customers)"
          >
            <InfoRows
              rows={[
                {
                  term: "What we collect:",
                  detail:
                    "your name and phone number, your email if you give it, your device type and details, the problem you describe, and how you want the repair arranged (drop-off, meetup, home service or other) with any details you add.",
                },
                {
                  term: "Who can see it:",
                  detail:
                    "the repair shop or repairer you sent it to, and their staff. The Tracknologia team can see it to keep the service running. Other shops and repairers can't.",
                },
                {
                  term: "How long we keep it:",
                  detail:
                    "for as long as that shop or repairer uses Tracknologia. If they leave, their repair records are deleted. Copies may stay in backups for a limited time.",
                },
              ]}
            />
          </PrivacySection>

          <PrivacySection
            id="privacy-tracking"
            icon={Search01Icon}
            title="3. Tracking a repair"
          >
            <p>
              Anyone with your tracking code can see your repair&apos;s status,
              the device, the problem you described, the updates the shop writes
              for you and the shop&apos;s name. They can&apos;t see your name or
              phone number.{" "}
              <strong className="text-foreground">
                Keep your tracking code private.
              </strong>
            </p>
            <p>
              When a tracking page is viewed, we record only the time, to count
              how often tracking is used. We keep that for as long as the repair.
              To stop abuse, we limit lookups with a temporary coded key, not
              your IP address.
            </p>
          </PrivacySection>

          <PrivacySection
            id="privacy-providers"
            icon={Store01Icon}
            title="4. Repair shops and repairers (Provider accounts)"
          >
            <InfoRows
              rows={[
                {
                  term: "What we collect:",
                  detail:
                    "your email and password (handled by our sign-in provider), your name, and the shop details you enter. Your shop's public page shows only what you choose to publish there, such as its name and address.",
                },
                {
                  term: "Who can see it:",
                  detail:
                    "you, the staff you invite, and the Tracknologia team. Your public page can be seen by anyone with its link.",
                },
                {
                  term: "How long we keep it:",
                  detail:
                    "while your account exists. To delete your account and your shop's data, email the Tracknologia team (below). We do it within 30 days. Copies may stay in backups for a limited time.",
                },
              ]}
            />
          </PrivacySection>

          <PrivacySection
            id="privacy-contact"
            icon={UserIcon}
            title="5. Who we are and how to reach us"
          >
            <p>
              Questions about your information: email the Tracknologia team at
            </p>
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              className={buttonVariants({ variant: "outline" })}
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>
            <p>
              We review this page if the way Tracknologia handles information
              changes.
            </p>
          </PrivacySection>

          <p className="text-xs text-muted-foreground">
            Last updated: 31 October 2026.
          </p>
        </div>
      </main>
    </div>
  );
}

function PrivacySection({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <HugeiconsIcon icon={icon} aria-hidden="true" className="size-4" />
          </span>
          <CardTitle>
            <h2
              id={id}
              className="text-lg font-bold tracking-tight text-foreground"
            >
              {title}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function InfoRows({ rows }: { rows: { term: string; detail: string }[] }) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((row) => (
        <div
          key={row.term}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-3 sm:gap-4"
        >
          <dt className="text-sm font-medium text-foreground sm:col-span-1">
            {row.term}
          </dt>
          <dd className="text-sm text-muted-foreground sm:col-span-2">
            {row.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}
