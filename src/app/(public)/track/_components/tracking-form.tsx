"use client";

import { useActionState } from "react";
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

  return (
    <section aria-live="polite" className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
            <StatusGauge
              status={view.currentStatus}
              className="size-24 sm:size-32"
            />
            <div className="min-w-0 space-y-3">
              <span
                data-status={view.currentStatus}
                className="status-badge inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold"
              >
                {view.statusLabel}
              </span>
              <h2 className="text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl">
                {view.deviceSummary}
              </h2>
              <p className="text-sm text-muted-foreground wrap-anywhere">
                {view.providerDisplayName}
              </p>
              <p className="text-sm leading-relaxed text-foreground">
                {view.statusDescription}
              </p>
            </div>
          </div>
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
              <Input
                id="trackingCode"
                name="trackingCode"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                defaultValue={initialCode}
                placeholder="e.g. TRK-0123... or REQ-0123..."
                className="h-11 font-mono uppercase tracking-wide"
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={
                  errorMessage ? "tracking-code-error" : undefined
                }
                required
              />
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

      {errorMessage && (
        <Card role="alert" id="tracking-code-error">
          <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center">
            {state?.outcome === "not-found" && <StatusGauge status={null} />}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                {state?.outcome === "not-found"
                  ? "We couldn't find that code"
                  : "Tracking unavailable"}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {errorMessage}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {!pending && state?.outcome === "found" && (
        <TrackingResult view={state.view} />
      )}
    </div>
  );
}
