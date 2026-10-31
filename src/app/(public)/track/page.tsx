import { BrandLogo } from "@/components/shared/brand-logo";
import { StatusGauge } from "@/components/shared/status-gauge";
import { Card } from "@/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";

import { TrackingForm } from "./_components/tracking-form";

export const metadata: Metadata = {
  title: "Track your repair — Tracknologia",
  description:
    "Check customer-safe repair status and updates using your Tracking Code or Request Reference.",
};

const CODE_HELP = [
  {
    code: "TRK-…",
    title: "Tracking Code",
    text: "From your provider when your repair is created.",
  },
  {
    code: "REQ-…",
    title: "Request Reference",
    text: "Shown after you send a repair request.",
  },
] as const;

const STATUS_GUIDE = [
  {
    status: "SUBMITTED",
    label: "Request sent",
    text: "Your request is with the provider.",
  },
  {
    status: "IN_PROGRESS",
    label: "Being repaired",
    text: "A technician is working on your device.",
  },
  {
    status: "READY",
    label: "Ready",
    text: "Your device is fixed and ready for handover.",
  },
  {
    status: "COMPLETED",
    label: "Returned to you",
    text: "This repair is complete.",
  },
] as const;

export default async function TrackRepairPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const rawCode =
    typeof params?.code === "string" ? params.code.trim().toUpperCase() : "";

  // Only allow REQ reference codes to be prefilled via query parameter (e.g. from submission receipt).
  // TRK tracking codes must never be accepted via URL query param to preserve credential privacy.
  const initialCode = /^REQ-[A-F0-9]{16}$/i.test(rawCode) ? rawCode : "";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex shrink-0">
            <BrandLogo />
          </Link>
          <Link
            href="/login"
            className="px-2 py-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <TrackingForm initialCode={initialCode} />

        <div className="mx-auto max-w-2xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
          <section aria-labelledby="code-help">
            <h2
              id="code-help"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              Where&apos;s my code?
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {CODE_HELP.map((item) => (
                <Card key={item.code} className="p-4">
                  <p className="font-mono text-sm tracking-widest text-muted-foreground uppercase">
                    {item.code}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="status-guide">
            <h2
              id="status-guide"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              What each status means
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATUS_GUIDE.map((item) => (
                <Card key={item.status} className="p-4">
                  <StatusGauge status={item.status} className="size-12" />
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {item.text}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
            No account needed. Need help with your code or service arrangement?
            Contact your Repair Provider.
          </p>

          <p className="px-2 text-center text-sm text-muted-foreground">
            Something about Tracknologia itself?{" "}
            <Link
              href="/feedback"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Send feedback
            </Link>
          </p>

          <p className="px-2 text-center text-sm text-muted-foreground">
            <Link
              href="/privacy"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Privacy notice
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
