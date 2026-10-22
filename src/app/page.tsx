import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Link01Icon,
  LockIcon,
  Message01Icon,
  SmartPhone01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { BrandLogo } from "@/components/shared/brand-logo";
import { StatusGauge } from "@/components/shared/status-gauge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const journey = [
  {
    status: "SUBMITTED" as const,
    label: "Request sent",
    text: "Your provider reviews the request and accepts or declines it.",
  },
  {
    status: "IN_PROGRESS" as const,
    label: "Being repaired",
    text: "A technician is working on your device.",
  },
  {
    status: "READY" as const,
    label: "Ready",
    text: "The repair is finished and ready for handover.",
  },
  {
    status: "COMPLETED" as const,
    label: "Returned to you",
    text: "The repair is complete and handover is done.",
  },
];

const features = [
  {
    icon: Link01Icon,
    title: "Request link intake",
    text: "Customers send repair requests through your provider link. Accept or decline each one.",
  },
  {
    icon: Wrench01Icon,
    title: "Direct repairs",
    text: "Create a repair yourself when a device arrives without a request.",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "Clear statuses",
    text: "Active work, waiting states, readiness and completion, with nothing invented along the way.",
  },
  {
    icon: Message01Icon,
    title: "Customer updates",
    text: "Share updates the customer can follow with their tracking code.",
  },
  {
    icon: LockIcon,
    title: "Private internal notes",
    text: "Diagnosis and internal notes stay in your workspace, never on the customer page.",
  },
  {
    icon: SmartPhone01Icon,
    title: "Phone-friendly",
    text: "Work from a phone at the bench or on a home visit, without a desktop.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="shrink-0 rounded-sm">
            <BrandLogo />
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 sm:gap-4"
          >
            <Link
              href="#providers"
              className="hidden px-2 py-3 text-sm font-medium underline-offset-4 hover:underline sm:inline-flex"
            >
              For providers
            </Link>
            <Link
              href="/track"
              className="px-2 py-3 text-sm font-medium underline-offset-4 hover:underline"
            >
              Track a repair
            </Link>
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-foreground text-background">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
            <div>
              <p className="font-mono text-xs font-medium uppercase tracking-widest text-background/70">
                Repair tracking for shops and independents
              </p>
              <h1 className="mt-4 text-5xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">
                Repair updates.
                <br />
                Without the guesswork.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-background/75">
                See where things stand, read your provider&apos;s latest update,
                and know what happens next. All with the code on your receipt.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/track"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "min-h-12 px-6",
                  )}
                >
                  Track Repair or Request
                </Link>
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "min-h-12 border-background/30 bg-transparent px-6 text-background hover:bg-background/10 hover:text-background",
                  )}
                >
                  Create Provider Account
                </Link>
              </div>
              <p className="mt-4 text-sm text-background/70">
                Customers can track without an account.
              </p>
            </div>

            <Card className="p-6 text-foreground sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Customer tracking · TRK-7Q4M
                </p>
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  Example
                </span>
              </div>
              <div className="mt-6 flex items-center gap-5">
                <StatusGauge status="READY" className="size-22 shrink-0" />
                <h2 className="text-3xl leading-tight font-extrabold tracking-tight">
                  Your iPhone is{" "}
                  <span className="rounded-md bg-primary px-2 text-foreground">
                    ready
                  </span>
                </h2>
              </div>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                Pick it up at your provider&apos;s shop, Mon–Sat until
                7&nbsp;pm. Bring your tracking code.
              </p>
              <div className="mt-6 border-t border-border pt-4">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  Latest update
                </p>
                <p className="mt-1 text-sm font-medium">
                  Final testing passed. Battery and screen checked.
                </p>
              </div>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-balance">
            From request to return.
          </h2>
          <ol className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {journey.map((step) => (
              <li key={step.status}>
                <Card className="h-full p-5">
                  <StatusGauge status={step.status} className="size-16" />
                  <h3 className="mt-5 font-semibold">{step.label}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="providers"
          className="border-t border-border bg-card py-16 sm:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance">
              Built for the way you repair.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              A focused workspace for repair shops and independent repairers, at
              your desk or on your phone.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="p-5 sm:p-6">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/20 text-foreground">
                    <HugeiconsIcon icon={feature.icon} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.text}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-secondary">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                Start with one workspace for your repairs.
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Shops and independent repairers create a provider account, then
                share their request link with customers.
              </p>
            </div>
            <Link
              href="/register"
              className={cn(buttonVariants({ size: "lg" }), "min-h-12 px-6")}
            >
              Set up your workspace
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-foreground py-8 text-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-3">
            <BrandLogo className="text-background" />
            <p className="text-xs text-background/70">
              Tracknologia &copy; {new Date().getFullYear()}
            </p>
          </div>
          <nav aria-label="Footer navigation" className="flex gap-6 text-sm">
            <Link href="/track" className="underline-offset-4 hover:underline">
              Track
            </Link>
            <Link href="/login" className="underline-offset-4 hover:underline">
              Sign In
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
