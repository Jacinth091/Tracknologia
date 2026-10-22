import Link from "next/link";
import { BrandLogo } from "@/components/shared/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="rounded-sm">
            <BrandLogo />
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-2 sm:gap-4"
          >
            <Link
              href="#providers"
              className="px-2 py-3 text-sm font-medium underline-offset-4 hover:underline"
            >
              For providers
            </Link>
            <Link
              href="/login"
              className={buttonVariants({ variant: "outline" })}
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="grid items-end gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
            <div>
              <h1 className="max-w-3xl text-5xl leading-[1.08] font-bold tracking-tight text-balance sm:text-6xl">
                Repair updates.
                <br />
                Without the guesswork.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
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
                    "min-h-12 px-6",
                  )}
                >
                  Create Provider Account
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Customers can track without an account.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
              <h2 className="text-xl font-semibold">From request to return.</h2>
              <ol className="mt-6 space-y-6">
                <li>
                  <h3 className="font-semibold">Start with your provider</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Send a repair request through their link, or arrange a
                    repair directly.
                  </p>
                </li>
                <li>
                  <h3 className="font-semibold">Keep your code close</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Use your Request Reference or Tracking Code to check the
                    current status.
                  </p>
                </li>
                <li>
                  <h3 className="font-semibold">Know the next step</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Follow customer updates and your agreed handover
                    arrangement.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </section>
        <section
          id="providers"
          className="border-t border-border bg-card py-14 sm:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-balance">
                  Built for the way you repair.
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  A focused workspace for repair shops and independent
                  repairers, at your desk or on your phone.
                </p>
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "mt-6 min-h-11",
                  )}
                >
                  Set up your workspace
                </Link>
              </div>
              <dl className="divide-y divide-border">
                {[
                  [
                    "One place for accepted work",
                    "Review customer requests or create repairs directly. Keep customer details, reported problems, and your diagnosis together.",
                  ],
                  [
                    "Clear, meaningful statuses",
                    "Record active work, waiting states, readiness, and completed handover without extra administrative steps.",
                  ],
                  [
                    "Updates customers can follow",
                    "Share repair updates through a tracking code while keeping your internal notes private.",
                  ],
                ].map(([title, description]) => (
                  <div key={title} className="py-5 first:pt-0 last:pb-0">
                    <dt className="font-semibold">{title}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-7 text-center text-xs text-muted-foreground">
        <p>Tracknologia &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
