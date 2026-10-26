"use client";

import { useActionState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { StatusGauge } from "@/components/shared/status-gauge";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicRepairView, TrackingStatus } from "@/features/tracking";
import { cn } from "@/lib/utils";

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

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60_000);

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return formatter.format(diffMonths, "month");
  }

  return formatter.format(Math.round(diffMonths / 12), "year");
}

type JourneyStep = {
  key: string;
  label: string;
};

const REQUEST_STEP: JourneyStep = { key: "request", label: "Request sent" };
const REPAIR_STEP: JourneyStep = { key: "repair", label: "Being repaired" };
const READY_STEP: JourneyStep = { key: "ready", label: "Ready" };
const HANDOVER_STEP: JourneyStep = {
  key: "handover",
  label: "Returned to you",
};

function getJourney(view: PublicRepairView): {
  steps: JourneyStep[];
  currentIndex: number;
} {
  if (view.currentStatus === "DECLINED") {
    return {
      steps: [REQUEST_STEP, { key: "declined", label: "Request declined" }],
      currentIndex: 1,
    };
  }

  const includesRequest = view.trackingType === "REQUEST";
  const steps: JourneyStep[] = includesRequest
    ? [REQUEST_STEP, REPAIR_STEP, READY_STEP, HANDOVER_STEP]
    : [REPAIR_STEP, READY_STEP, HANDOVER_STEP];
  const repairIndex = includesRequest ? 1 : 0;

  if (view.currentStatus === "WAITING_FOR_PARTS") {
    steps[repairIndex] = { key: "repair", label: "Waiting for a part" };
  } else if (view.currentStatus === "AWAITING_APPROVAL") {
    steps[repairIndex] = { key: "repair", label: "Awaiting your approval" };
  }

  let currentIndex = repairIndex;
  if (view.currentStatus === "SUBMITTED") {
    currentIndex = 0;
  } else if (view.currentStatus === "READY") {
    currentIndex = repairIndex + 1;
  } else if (view.currentStatus === "COMPLETED") {
    currentIndex = repairIndex + 2;
  }

  return { steps, currentIndex };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words text-foreground">
        {value}
      </dd>
    </div>
  );
}

function JourneyTimeline({ view }: { view: PublicRepairView }) {
  const { steps, currentIndex } = getJourney(view);

  return (
    <div className="space-y-3 border-t border-border pt-6">
      <h3 className="text-base font-semibold">Repair journey</h3>
      <ol className="space-y-4 border-l border-border pl-4">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;

          return (
            <li
              key={step.key}
              aria-current={isCurrent ? "step" : undefined}
              className="relative"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1.5 -left-[21px] size-2.5 rounded-full",
                  isCurrent && "bg-primary ring-4 ring-primary/15",
                  isComplete && "bg-foreground",
                  !isCurrent &&
                    !isComplete &&
                    "border border-border bg-background",
                )}
              />
              <p
                className={cn(
                  "text-sm",
                  isCurrent && "font-semibold text-foreground",
                  isComplete && "font-medium text-foreground",
                  !isCurrent && !isComplete && "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TrackingResult({ view }: { view: PublicRepairView }) {
  const [latestUpdate, ...earlierUpdates] = view.customerUpdates;
  const eyebrow =
    view.trackingType === "REQUEST" ? "Repair request" : "Customer tracking";
  const { deviceType, brandModel } = view;
  const relativeLastUpdate = formatRelativeTime(view.lastUpdatedAt);
  const lastUpdate = relativeLastUpdate
    ? `${relativeLastUpdate} · ${formatDateTime(view.lastUpdatedAt)}`
    : formatDateTime(view.lastUpdatedAt);
  const codeType =
    view.trackingType === "REQUEST" ? "Request reference" : "Tracking code";

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
                Your {deviceType}
              </p>
              {brandModel ? (
                <p className="line-clamp-2 text-sm leading-snug font-medium break-words text-foreground">
                  {brandModel}
                </p>
              ) : null}
              <p className="line-clamp-2 text-sm break-words text-muted-foreground">
                At {view.providerDisplayName}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Detail label="Device" value={deviceType || "Not provided"} />
            <Detail
              label="Brand & model"
              value={brandModel ?? "Not provided"}
            />
            <Detail
              label="Service arrangement"
              value={view.serviceModeLabel ?? "Not provided"}
            />
            <Detail label="Last update" value={lastUpdate} />
            <Detail
              label="Received"
              value={formatDateTime(view.submittedAt)}
            />
            <Detail label="Code type" value={codeType} />
          </dl>

          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <p className="font-semibold">Reported problem</p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {view.reportedProblem}
            </p>
          </div>

          <JourneyTimeline view={view} />

          <div className="rounded-xl border border-border bg-muted/50 p-4">
            <p className="font-semibold">What happens next</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              {view.statusDescription}
            </p>
            {view.handoverMessage ? (
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {view.handoverMessage}
              </p>
            ) : null}
          </div>

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

  const hasOutcome = pending || state !== null;

  return (
    <div aria-busy={pending}>
      <section className="bg-foreground text-background">
        <div
          className={cn(
            "mx-auto max-w-2xl px-4 sm:px-6",
            hasOutcome ? "py-6 sm:py-8" : "py-10 sm:py-14",
          )}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 max-w-xl">
              <p className="font-mono text-xs font-medium tracking-widest text-background/60 uppercase">
                Track a repair
              </p>
              <h1
                className={cn(
                  "mt-3 font-extrabold tracking-tight text-balance",
                  hasOutcome ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl",
                )}
              >
                Your update, at a glance.
              </h1>
              {!hasOutcome && (
                <p className="mt-3 text-sm leading-relaxed text-background/70 sm:text-base">
                  Enter the Tracking Code from your Provider, or the Request
                  Reference you received after sending a request. No account
                  needed.
                </p>
              )}
            </div>
            {!hasOutcome && (
              <StatusGauge
                status={null}
                className="size-20 shrink-0 self-start text-background/85 sm:size-28 sm:self-auto"
              />
            )}
          </div>

          <Card className="mt-6 p-4 text-foreground shadow-lg sm:p-5">
            <form
              action={formAction}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="trackingCode">
                  Tracking Code / Request Code
                </Label>
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
                    className="h-12 pl-9 font-mono text-base tracking-wide uppercase placeholder:normal-case"
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
                className="min-h-12 w-full sm:w-auto"
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
          </Card>
        </div>
      </section>

      {(pending || errorMessage || state?.outcome === "found") && (
        <div className="mx-auto max-w-2xl space-y-6 px-4 pt-6 sm:px-6 sm:pt-8">
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
      )}
    </div>
  );
}
