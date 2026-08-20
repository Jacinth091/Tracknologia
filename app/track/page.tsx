import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Track Repair — Tracknologia",
  description: "Check the real-time status of your device repair",
};

export default async function TrackPage(props: {
  searchParams?: Promise<{ code?: string }>;
}) {
  const searchParams = await props.searchParams;
  const trackingCode = searchParams?.code?.trim().toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="border-b border-border/80 bg-background/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
            Tracknologia
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Provider Sign In
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-xl space-y-8">
          {/* Tracking Search Box */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Track Your Repair
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter the tracking code provided on your repair intake ticket or receipt.
            </p>
          </div>

          <form method="GET" action="/track" className="flex gap-2">
            <Input
              name="code"
              defaultValue={trackingCode}
              placeholder="e.g. TRK-892147"
              className="h-11 font-mono uppercase tracking-wider text-base"
              required
            />
            <Button type="submit" size="lg" className="px-6">
              Track
            </Button>
          </form>

          {/* Tracking Results View */}
          {trackingCode ? (
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="border-b border-border/60 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono font-medium text-muted-foreground uppercase">
                      Tracking Code
                    </span>
                    <p className="text-base font-mono font-semibold text-foreground">
                      {trackingCode}
                    </p>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    IN PROGRESS
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                {/* Provider Snapshot */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Repair Provider
                  </h3>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    Apex Electronics & Mobile Repair
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Contact: (555) 234-5678
                  </p>
                </div>

                {/* Device Snapshot */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Device Information
                  </h3>
                  <div className="mt-2 rounded-xl bg-muted/40 p-3 text-sm">
                    <p className="font-medium text-foreground">Apple iPhone 14 Pro</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Issue: Screen replacement & battery diagnostic
                    </p>
                  </div>
                </div>

                {/* Progress History */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Progress Updates
                  </h3>
                  <ol className="relative border-l border-border/80 ml-3 space-y-4 text-sm">
                    <li className="ml-4">
                      <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                      <p className="font-medium text-foreground">
                        Parts received & repair in progress
                      </p>
                      <time className="text-xs text-muted-foreground">Today at 2:30 PM</time>
                    </li>
                    <li className="ml-4">
                      <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
                      <p className="text-muted-foreground">Device intake verified</p>
                      <time className="text-xs text-muted-foreground">Yesterday at 11:15 AM</time>
                    </li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-muted/20 border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No tracking code entered yet. Enter your code above to view live progress.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
