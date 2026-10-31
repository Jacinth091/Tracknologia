import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  getValidationMetrics,
  MetricsError,
  requireInternalOperator,
  type ValidationMetrics,
} from "@/features/internal-operations";
import { cn } from "@/lib/utils";
import { InternalServiceUnavailable } from "../_components/internal-service-unavailable";
import { CategoryBars, DailyColumns } from "../_components/charts";

export const metadata: Metadata = {
  title: "Validation metrics — Tracknologia",
  description: "Operator view of pilot validation metrics",
};

const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
] as const;

const REPAIR_STATUS_ORDER = [
  "IN_PROGRESS",
  "WAITING_FOR_PARTS",
  "AWAITING_APPROVAL",
  "READY",
  "COMPLETED",
] as const;

const FEEDBACK_CATEGORY_ORDER = [
  "BUG",
  "USABILITY",
  "FEATURE_REQUEST",
  "GENERAL",
] as const;

type Period = (typeof PERIOD_OPTIONS)[number]["value"];

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function nonEmptyParam(value?: string) {
  return value && value.length > 0 ? value : undefined;
}

// Unknown or missing periods fall back to the default 7-day window.
function selectedPeriod(value?: string): Period {
  const match = PERIOD_OPTIONS.find((option) => option.value === value);
  return match ? match.value : "7d";
}

function windowInput(period: Period, start?: string, end?: string) {
  if (period === "custom") {
    return { mode: "custom", startDate: start, endDateExclusive: end };
  }
  return { mode: period };
}

function activityHref(period: Period, start?: string, end?: string) {
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }
  return `/internal/activity?${params.toString()}`;
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatCount(value: number | null) {
  return value === null ? "N/A" : value.toLocaleString("en-PH");
}

function formatPercent(value: number | null) {
  return value === null ? "N/A" : `${value}%`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "N/A";
  if (seconds < 60) return "under 1 min";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string | string[];
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const period = selectedPeriod(firstSearchParam(params.period));
  const start = nonEmptyParam(firstSearchParam(params.start));
  const end = nonEmptyParam(firstSearchParam(params.end));

  // Same fail-closed guard as the internal home page; the metrics read
  // re-runs it and records the audit before any number is loaded.
  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal%2Factivity");
  }

  if (access.status === "FORBIDDEN") {
    notFound();
  }

  if (access.status === "UNAVAILABLE") {
    return <InternalServiceUnavailable />;
  }

  let metrics: ValidationMetrics;
  try {
    metrics = await getValidationMetrics(windowInput(period, start, end));
  } catch (error) {
    if (error instanceof MetricsError) {
      if (error.code === "FORBIDDEN") {
        notFound();
      }
      if (error.code === "UNAVAILABLE") {
        return <InternalServiceUnavailable />;
      }
      return (
        <ActivityFrame period={period} start={start} end={end}>
          <Card className="p-5 text-sm">
            That period isn&apos;t valid. Choose today, 7 or 30 days, or a
            custom range up to 90 days.
          </Card>
        </ActivityFrame>
      );
    }
    throw error;
  }

  return (
    <ActivityFrame period={period} start={start} end={end}>
      <PeriodSummary range={metrics.window} asOf={metrics.asOf} />
      <CoverageNotes coverage={metrics.coverage} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <DailyColumns
            title="Active providers per day"
            days={metrics.activity.daily.map((day) => ({
              date: day.date,
              value: day.distinctProviders,
            }))}
            unit={{ singular: "active provider", plural: "active providers" }}
          />
        </Card>

        <Card className="space-y-3 p-5">
          {metrics.feedback ? (
            <DailyColumns
              title="Feedback per day"
              days={metrics.feedback.daily.map((day) => ({
                date: day.date,
                value: day.count,
              }))}
              unit={{ singular: "submission", plural: "submissions" }}
            />
          ) : (
            <UnavailableChart title="Feedback per day" />
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <CategoryBars
            title="Repairs by status (now)"
            rows={REPAIR_STATUS_ORDER.map((status) => ({
              label: humanize(status),
              value: metrics.repairs.statusNow[status],
            }))}
          />
        </Card>

        <Card className="space-y-3 p-5">
          {metrics.feedback ? (
            <CategoryBars
              title="Feedback by category"
              rows={FEEDBACK_CATEGORY_ORDER.map((category) => ({
                label: humanize(category),
                value: metrics.feedback?.byCategory[category] ?? 0,
              }))}
            />
          ) : (
            <UnavailableChart title="Feedback by category" />
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Providers">
          <CountGroup
            title="Onboarded in period"
            counts={metrics.providers.onboardedInPeriod}
          />
          <CountGroup title="All time" counts={metrics.providers.allTime} />
        </MetricCard>

        <MetricCard title="Activity">
          <Stat
            label="Active providers"
            value={formatCount(metrics.activity.distinctProviders)}
          />
          <Stat
            label="Repeat providers (2 or more days)"
            value={formatCount(metrics.activity.repeatProviders)}
          />
        </MetricCard>

        <MetricCard title="Staff">
          <Stat
            label="Active memberships (now)"
            value={formatCount(metrics.staff.memberships)}
          />
          <Stat
            label="Shops with staff (now)"
            value={formatCount(metrics.staff.shopsWithStaff)}
          />
        </MetricCard>

        <MetricCard title="Repairs">
          <Stat
            label="Created in period"
            value={formatCount(metrics.repairs.created.total)}
          />
          <Stat
            label="From customer request"
            value={formatCount(metrics.repairs.created.customerRequest)}
          />
          <Stat
            label="Provider created"
            value={formatCount(metrics.repairs.created.providerCreated)}
          />
          <Stat
            label="Reached READY in period"
            value={formatCount(metrics.repairs.readyReached)}
          />
          <Stat
            label="Completed in period"
            value={formatCount(metrics.repairs.completed)}
          />
          <CountGroup title="Status now" counts={metrics.repairs.statusNow} />
        </MetricCard>

        <MetricCard title="Requests">
          <Stat
            label="Received in period"
            value={formatCount(metrics.requests.received)}
          />
          <Stat
            label="Decided in period"
            value={formatCount(metrics.requests.decided.total)}
          />
          <Stat
            label="Accepted"
            value={formatCount(metrics.requests.decided.accepted)}
          />
          <Stat
            label="Declined"
            value={formatCount(metrics.requests.decided.declined)}
          />
          <Stat
            label="Pending (now)"
            value={formatCount(metrics.requests.pendingNow)}
          />
          <Stat
            label="Conversion (submission cohort)"
            value={formatPercent(metrics.requests.conversionPercent)}
          />
          <Stat
            label="Mean decision time"
            value={formatDuration(metrics.requests.meanDecisionSeconds)}
          />
        </MetricCard>

        <MetricCard title="Tracking">
          <Stat
            label="Views in period"
            value={formatCount(metrics.tracking.periodViews)}
          />
          <Stat
            label="Distinct repairs viewed in period"
            value={formatCount(metrics.tracking.periodRepairsViewed)}
          />
          <Stat
            label="Adoption (all time)"
            value={formatPercent(metrics.tracking.adoptionPercent)}
          />
        </MetricCard>

        <MetricCard title="Feedback">
          {metrics.feedback ? (
            <>
              <Stat
                label="Submissions in period"
                value={formatCount(metrics.feedback.total)}
              />
              <CountGroup
                title="By category"
                counts={metrics.feedback.byCategory}
              />
              <CountGroup
                title="By status"
                counts={metrics.feedback.byStatus}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unavailable for this period.
            </p>
          )}
        </MetricCard>
      </div>
    </ActivityFrame>
  );
}

function ActivityFrame({
  period,
  start,
  end,
  children,
}: {
  period: Period;
  start?: string;
  end?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Operator view
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Validation metrics
          </h1>
        </div>
        <Link
          href={activityHref(period, start, end)}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Refresh
        </Link>
      </div>

      <PeriodPicker period={period} start={start} end={end} />

      {children}
    </div>
  );
}

function PeriodPicker({
  period,
  start,
  end,
}: {
  period: Period;
  start?: string;
  end?: string;
}) {
  return (
    <form
      method="get"
      action="/internal/activity"
      aria-label="Metrics period"
      className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4 sm:items-end"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="metrics-period">Period</Label>
        <select
          id="metrics-period"
          name="period"
          defaultValue={period}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="metrics-start">Start date</Label>
        <input
          id="metrics-start"
          name="start"
          type="date"
          defaultValue={start ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="metrics-end">End date (exclusive)</Label>
        <input
          id="metrics-end"
          name="end"
          type="date"
          defaultValue={end ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <div>
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Show period
        </button>
      </div>
    </form>
  );
}

function PeriodSummary({
  range,
  asOf,
}: {
  range: ValidationMetrics["window"];
  asOf: string;
}) {
  return (
    <Card className="grid gap-3 p-4 text-sm sm:grid-cols-3">
      <div>
        <p className="text-muted-foreground">Period (Asia/Manila)</p>
        <p className="font-medium">
          {range.startDate} to {range.endDateExclusive} (end exclusive)
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">Days</p>
        <p className="font-medium">{range.days}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Generated (Asia/Manila)</p>
        <p className="font-medium">{formatTimestamp(asOf)}</p>
      </div>
    </Card>
  );
}

function CoverageNotes({
  coverage,
}: {
  coverage: ValidationMetrics["coverage"];
}) {
  const { feedback } = coverage;
  return (
    <Card className="space-y-2 p-4 text-sm">
      <p className="font-medium">Coverage</p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          Domain counts: {humanize(coverage.domain.coverage)}, snapshot{" "}
          {humanize(coverage.domain.snapshot)}. Observed up to{" "}
          {formatTimestamp(coverage.domain.observedEndUtc)}.
        </li>
        <li>
          {feedback.status === "AVAILABLE" &&
          feedback.asOfStart &&
          feedback.asOfEnd ? (
            <>
              Feedback: {humanize(feedback.coverage)}, generated{" "}
              {formatTimestamp(feedback.asOfStart)} to{" "}
              {formatTimestamp(feedback.asOfEnd)} in {feedback.batches}{" "}
              {feedback.batches === 1 ? "batch" : "batches"}.
            </>
          ) : (
            "Feedback: unavailable for this period."
          )}
        </li>
        <li>Retention policy: Approved (#87, 2026-10-31).</li>
      </ul>
    </Card>
  );
}

function MetricCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function UnavailableChart({ title }: { title: string }) {
  return (
    <>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">
        Unavailable for this period.
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function CountGroup({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}) {
  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {Object.entries(counts).map(([key, count]) => (
        <Stat key={key} label={humanize(key)} value={formatCount(count)} />
      ))}
    </div>
  );
}
