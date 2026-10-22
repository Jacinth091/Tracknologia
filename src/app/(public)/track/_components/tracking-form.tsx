"use client";

import { useActionState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { StatusGauge } from "@/components/shared/status-gauge";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicRepairView, TrackingStatus } from "@/features/tracking";

import { trackRepairAction, type TrackRepairActionState } from "../actions";

export function getProgressEmptyMessage(status: TrackingStatus): string {
  if (status === "SUBMITTED") {
    return "Your request is awaiting provider review. Updates will appear here once accepted.";
  }
  if (status === "DECLINED") {
    return "This request was declined. No repair progress updates are available for this request.";
  }
  return "No public customer updates have been posted yet. Check back soon.";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function TrackingResult({ view }: { view: PublicRepairView }) {
  const [latestUpdate, ...earlierUpdates] = view.customerUpdates;
  const eyebrow =
    view.trackingType === "REQUEST" ? "Repair request" : "Customer tracking";

  return (
    <section aria-live="polite">
      <Card className="overflow-hidden">
        <CardHeader className="gap-5 border-b border-border">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase break-all">
            {eyebrow} · {view.trackingCode}
          </p>
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
            <StatusGauge
              status={view.currentStatus}
              className="size-22 shrink-0"
            />
            <div className="min-w-0 space-y-2">
              <h2 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                {view.currentStatus === "READY" ? (
                  <span
                    data-status={view.currentStatus}
                    className="status-badge rounded-md px-2"
                  >
                    {view.statusLabel}
                  </span>
                ) : (
                  view.statusLabel
                )}
              </h2>
              <p className="line-clamp-2 text-base leading-snug font-bold break-words text-foreground">
                {view.deviceSummary}
              </p>
              <p className="text-sm break-words text-muted-foreground">
                {view.providerDisplayName}
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {view.statusDescription}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">
                Service arrangement
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {view.serviceModeLabel ?? "To be arranged with Provider"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Latest update</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {formatDateTime(view.lastUpdatedAt)}
              </dd>
            </div>
          </dl>

          {view.handoverMessage && (
            <div className="rounded-2xl border border-border bg-accent p-4 text-sm text-accent-foreground">
              <p className="font-semibold">Next steps</p>
              <p className="mt-1">{view.handoverMessage}</p>
            </div>
          )}

          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-base font-semibold">Customer updates</h3>
            {latestUpdate ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatDateTime(latestUpdate.createdAt)}
                  </p>
                  <p className="text-base leading-relaxed whitespace-pre-wrap wrap-anywhere">
                    {latestUpdate.message}
                  </p>
                </div>

                {earlierUpdates.length > 0 && (
                  <details className="border-t border-border pt-3 text-sm">
                    <summary className="cursor-pointer py-2 font-medium text-foreground">
                      Earlier updates ({earlierUpdates.length})
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-border/80 pt-3">
                      {earlierUpdates.map((update, index) => (
                        <div
                          key={`${update.createdAt}-${index}`}
                          className="space-y-1"
                        >
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(update.createdAt)}
                          </p>
                          <p className="whitespace-pre-wrap wrap-anywhere text-foreground">
                            {update.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {getProgressEmptyMessage(view.currentStatus)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TicketSkeleton() {
  return (
    <Card aria-hidden="true" className="space-y-6 p-6">
      <Skeleton className="h-3 w-48" />
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Skeleton className="size-22 shrink-0 rounded-full" />
        <div className="w-full space-y-3">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-16 w-full" />
    </Card>
  );
}

export function TrackingForm({ initialCode = "" }: { initialCode?: string }) {
  const [state, formAction, pending] = useActionState<
    TrackRepairActionState,
    FormData
  >(trackRepairAction, null);

  const errorMessage =
    !pending &&
    (state?.outcome === "not-found" || state?.outcome === "unavailable")
      ? state.message
      : null;

  return (
    <div className="space-y-6" aria-busy={pending}>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enter Tracking Code</CardTitle>
          <CardDescription>
            Enter your Tracking Code (<span className="font-mono">TRK-</span>)
            or Request Reference Code (<span className="font-mono">REQ-</span>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trackingCode">Tracking Code / Request Code</Label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="trackingCode"
                  name="trackingCode"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={32}
                  defaultValue={initialCode}
                  placeholder="TRK-… or REQ-…"
                  className="h-11 pl-9 font-mono tracking-wide uppercase placeholder:normal-case"
                  aria-invalid={Boolean(errorMessage)}
                  aria-describedby={
                    errorMessage ? "tracking-code-error" : undefined
                  }
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="min-h-11 w-full sm:w-auto"
            >
              {pending ? (
                <>
                  <LoadingSpinner className="size-4" />
                  <span>Looking up...</span>
                </>
              ) : (
                "Track Status"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {pending && <TicketSkeleton />}

      {errorMessage && (
        <div
          role="alert"
          id="tracking-code-error"
          className="flex flex-col items-start gap-5 rounded-xl bg-foreground p-6 text-background sm:flex-row sm:items-center sm:p-8"
        >
          {state?.outcome === "not-found" && (
            <StatusGauge
              status={null}
              className="size-22 shrink-0 text-background"
            />
          )}
          <div className="space-y-2">
            <h2 className="text-xl font-bold">
              {state?.outcome === "not-found"
                ? "We couldn't find that code"
                : "Tracking unavailable"}
            </h2>
            <p className="text-sm leading-relaxed text-background/75">
              {errorMessage}
            </p>
          </div>
        </div>
      )}
      {!pending && state?.outcome === "found" && (
        <TrackingResult view={state.view} />
      )}
    </div>
  );
}
