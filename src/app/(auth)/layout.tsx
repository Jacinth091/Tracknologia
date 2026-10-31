import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  BellIcon,
  QrCodeIcon,
  SquareLock02Icon,
} from "@hugeicons/core-free-icons";

import { BrandLogo } from "@/components/shared/brand-logo";

const BRAND_POINTS = [
  {
    icon: QrCodeIcon,
    title: "Track by code",
    description: "Every repair carries one code customers can follow.",
  },
  {
    icon: BellIcon,
    title: "Customer updates",
    description: "Plain-language progress notes, no account required.",
  },
  {
    icon: SquareLock02Icon,
    title: "Private internal notes",
    description: "Workshop-only details never reach the customer view.",
  },
] as const;

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-foreground p-10 text-background lg:flex lg:min-h-screen lg:flex-col lg:justify-between xl:p-14">
      <div className="space-y-10">
        <Link
          href="/"
          className="inline-flex w-fit rounded-md bg-background px-3 py-2"
          aria-label="Tracknologia home"
        >
          <BrandLogo className="h-7" />
        </Link>

        <div className="max-w-md space-y-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-background/50">
            Provider workspace
          </p>
          <h2 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-balance xl:text-5xl">
            Repair updates. Without the guesswork.
          </h2>
          <p className="text-sm leading-relaxed text-background/70">
            One record per repair, from intake to handover — shared with the
            customer without exposing the workshop.
          </p>
        </div>
      </div>

      <ul className="mt-12 space-y-5">
        {BRAND_POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-3.5">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-background/15 bg-background/5">
              <HugeiconsIcon
                icon={point.icon}
                strokeWidth={1.8}
                className="size-4"
                aria-hidden="true"
              />
            </span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold">{point.title}</span>
              <span className="block text-xs leading-relaxed text-background/60">
                {point.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <BrandPanel />

      <div className="flex min-h-screen flex-col px-4 py-6 sm:py-8 lg:justify-center lg:px-10 lg:py-12 xl:px-16">
        <div className="mx-auto w-full max-w-xl space-y-5 sm:space-y-6">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              strokeWidth={2}
              aria-hidden="true"
              className="size-4"
            />
            Back to home
          </Link>
          <div className="space-y-1 text-center lg:hidden">
            <Link
              href="/"
              className="inline-block rounded-sm"
              aria-label="Tracknologia home"
            >
              <BrandLogo className="h-9" />
            </Link>
            <p className="text-sm text-muted-foreground">
              Repair Operations &amp; Tracking Platform
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
