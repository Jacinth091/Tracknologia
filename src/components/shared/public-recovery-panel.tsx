import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Wrench01Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { StatusGauge } from "./status-gauge";

export function PublicRecoveryPanel({
  kind,
}: {
  kind: "request-unavailable" | "not-found";
}) {
  const notFound = kind === "not-found";
  return (
    <section
      className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[0.85fr_1.15fr]"
      aria-labelledby="recovery-heading"
    >
      <div className="flex flex-col items-center justify-center gap-6 bg-foreground px-6 py-10 text-background sm:px-10 md:py-16">
        {notFound ? (
          <div className="flex items-center gap-2" role="img" aria-label="404">
            <span
              className="text-8xl font-extrabold tracking-tight"
              aria-hidden="true"
            >
              4
            </span>
            <StatusGauge
              status={null}
              className="size-24 text-primary sm:size-28"
            />
            <span
              className="text-8xl font-extrabold tracking-tight"
              aria-hidden="true"
            >
              4
            </span>
          </div>
        ) : (
          <div
            className="relative flex size-32 items-center justify-center sm:size-40"
            aria-hidden="true"
          >
            <StatusGauge
              status={null}
              className="absolute inset-0 size-full text-background"
            />
            <HugeiconsIcon
              icon={Wrench01Icon}
              strokeWidth={1.6}
              className="size-12 text-primary sm:size-14"
            />
          </div>
        )}
        <p className="text-center text-sm text-background/70">
          Let’s get you back on track.
        </p>
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-10 md:py-14">
        <h1
          id="recovery-heading"
          className="text-3xl font-extrabold leading-tight tracking-tight text-balance sm:text-4xl"
        >
          {notFound
            ? "We couldn’t find that page."
            : "This request link is unavailable."}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {notFound
            ? "The link may be out of date, or the address may have a typo. Let’s get you back to somewhere useful."
            : "This Provider may be unavailable or may not be accepting new Repair Requests. Check the link, or contact them directly to arrange service."}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href={notFound ? "/" : "/track"}
            className={buttonVariants({ size: "lg" })}
          >
            {notFound ? "Back to home" : "Track a repair"}
          </Link>
          <Link
            href={notFound ? "/track" : "/"}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {notFound ? "Track a repair" : "Back to home"}
          </Link>
        </div>
        <div className="mt-8 border-t border-border pt-5">
          <h2 className="text-sm font-semibold">
            {notFound
              ? "Following a shared link?"
              : "Already have a tracking code?"}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {notFound
              ? "Ask the person who sent it to check the address."
              : "Use it on the tracking page to look up your existing Repair."}
          </p>
        </div>
      </div>
    </section>
  );
}
