import { BrandLogo } from "@/components/shared/brand-logo";
import type { Metadata } from "next";
import Link from "next/link";

import { TrackingForm } from "./_components/tracking-form";

export const metadata: Metadata = {
  title: "Track Repair or Request — Tracknologia",
  description:
    "Check customer-safe repair status and updates using your Tracking Code or Request Reference.",
};

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
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex shrink-0">
            <BrandLogo />
          </Link>
          <span className="text-xs text-muted-foreground">
            No account needed
          </span>
        </div>

        <section className="py-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your update, at a glance.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Enter the Tracking Code (TRK-...) or Request Reference (REQ-...)
            provided by your Repair Provider. No account or sign-in is required.
          </p>
        </section>

        <TrackingForm initialCode={initialCode} />

        <p className="px-2 text-center text-xs leading-relaxed text-muted-foreground">
          Need help with your code or service arrangement? Contact your Repair
          Provider.
        </p>
      </div>
    </main>
  );
}
