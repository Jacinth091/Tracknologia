import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  Message01Icon,
  Ticket01Icon,
  UserGroupIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getValidationMetrics,
  MetricsError,
  requireInternalOperator,
  type ValidationMetrics,
} from "@/features/internal-operations";
import { InternalServiceUnavailable } from "../_components/internal-service-unavailable";
import {
  dailySeries,
  dailySummary,
  hasActivity,
  rankedSummary,
  type ChartRow,
} from "../_components/chart-data";
import { CategoryBarChart, DayBarChart } from "../_components/metric-charts";
import { StatTile } from "../_components/stat-tile";

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
        <ActivityShell period={period} start={start} end={end}>
          <Card className="p-5 text-sm">
            That period isn&apos;t valid. Choose today, 7 or 30 days, or a
            custom range up to 90 days.
          </Card>
        </ActivityShell>
      );
    }
    throw error;
  }

  const daily = dailySeries(
    metrics.activity.daily.map((day) => ({
      date: day.date,
      value: day.distinctProviders,
    })),
  );
  const feedbackDaily = metrics.feedback
    ? dailySeries(
        metrics.feedback.daily.map((day) => ({
          date: day.date,
          value: day.count,
        })),
      )
    : null;
  const statusRows = REPAIR_STATUS_ORDER.map((status) => ({
    key: status,
    label: humanize(status),
    value: metrics.repairs.statusNow[status],
  }));
  const categoryRows = metrics.feedback
    ? FEEDBACK_CATEGORY_ORDER.map((category) => ({
        key: category,
        label: humanize(category),
        value: metrics.feedback?.byCategory[category] ?? 0,
      }))
    : null;

  return (
    <ActivityShell period={period} start={start} end={end}>
      <p className="text-sm text-muted-foreground">
        Period (Asia/Manila): {metrics.window.startDate} to{" "}
        {metrics.window.endDateExclusive} (end exclusive), {metrics.window.days}{" "}
        days. Generated (Asia/Manila): {formatTimestamp(metrics.asOf)}.
      </p>
      <CoverageNotes coverage={metrics.coverage} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active providers (period)"
          value={formatCount(metrics.activity.distinctProviders)}
          status="ACCEPTED"
          icon={UserGroupIcon}
        />
        <StatTile
          label="Repairs created (period)"
          value={formatCount(metrics.repairs.created.total)}
          status="IN_PROGRESS"
          icon={Wrench01Icon}
        />
        <StatTile
          label="Requests received (period)"
          value={formatCount(metrics.requests.received)}
          status="SUBMITTED"
          icon={Ticket01Icon}
        />
        <StatTile
          label="Feedback submissions (period)"
          value={
            metrics.feedback
              ? formatCount(metrics.feedback.total)
              : "Unavailable"
          }
          status="AWAITING_APPROVAL"
          icon={Message01Icon}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Active providers per day"
          description="Distinct providers with activity on each Manila day"
        >
          <DailyChart
            title="Active providers per day"
            seriesLabel="Active providers"
            rows={daily}
          />
        </ChartCard>

        <ChartCard
          title="Feedback per day"
          description="Feedback submissions on each Manila day"
        >
          {feedbackDaily ? (
            <DailyChart
              title="Feedback per day"
              seriesLabel="Submissions"
              rows={feedbackDaily}
            />
          ) : (
            <UnavailableState />
          )}
        </ChartCard>

        <ChartCard
          title="Repairs by status (now)"
          description="Current Repair status, in lifecycle order"
        >
          <RankedChart title="Repairs by status (now)" rows={statusRows} />
        </ChartCard>

        <ChartCard
          title="Feedback by category"
          description="Feedback submissions in the period, by category"
        >
          {categoryRows ? (
            <RankedChart title="Feedback by category" rows={categoryRows} />
          ) : (
            <UnavailableState />
          )}
        </ChartCard>
      </div>

      <section
        aria-label="Metric details"
        className="grid gap-4 md:grid-cols-2"
      >
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
      </section>
    </ActivityShell>
  );
}

function ActivityShell({
  period,
  start,
  end,
  children,
}: {
  period: Period;
  start?: string;
  end?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal operations"
        title="Validation metrics"
        actions={
          <>
            <PeriodPicker period={period} start={start} end={end} />
            <Link
              href={activityHref(period, start, end)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Refresh
            </Link>
          </>
        }
      />
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
      className="flex flex-wrap items-end gap-2"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="metrics-period">Period</Label>
        <select
          id="metrics-period"
          name="period"
          defaultValue={period}
          className="h-9 min-w-32 rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:border-ring"
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
        <Input
          id="metrics-start"
          name="start"
          type="date"
          defaultValue={start ?? ""}
          className="h-9 w-40"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="metrics-end">End date (exclusive)</Label>
        <Input
          id="metrics-end"
          name="end"
          type="date"
          defaultValue={end ?? ""}
          className="h-9 w-40"
        />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Show period
      </Button>
    </form>
  );
}

function CoverageNotes({
  coverage,
}: {
  coverage: ValidationMetrics["coverage"];
}) {
  const { feedback } = coverage;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
        <h2 className="text-base leading-tight font-semibold">{title}</h2>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-4 sm:px-3 sm:pb-5">
        {children}
      </CardContent>
    </Card>
  );
}

function DailyChart({
  title,
  seriesLabel,
  rows,
}: {
  title: string;
  seriesLabel: string;
  rows: ChartRow[];
}) {
  if (!hasActivity(rows)) {
    return <NoActivityState />;
  }

  return (
    <DayBarChart
      seriesLabel={seriesLabel}
      summary={dailySummary(title, rows)}
      data={rows}
    />
  );
}

function RankedChart({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: number }[];
}) {
  if (!hasActivity(rows)) {
    return <NoActivityState />;
  }

  return (
    <CategoryBarChart
      summary={rankedSummary(title, rows)}
      data={rows.map((row) => ({ ...row, color: "var(--chart-1)" }))}
    />
  );
}

function NoActivityState() {
  return (
    <Empty className="min-h-48 p-6">
      <EmptyHeader>
        <EmptyTitle>No activity in this period</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

function UnavailableState() {
  return (
    <Empty className="min-h-48 p-6">
      <EmptyHeader>
        <EmptyTitle>Unavailable</EmptyTitle>
        <EmptyDescription>Unavailable for this period.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function MetricCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
        <h2 className="text-base leading-tight font-semibold">{title}</h2>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
        {children}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
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
    <div className="pt-2">
      <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      {Object.entries(counts).map(([key, count]) => (
        <Stat key={key} label={humanize(key)} value={formatCount(count)} />
      ))}
    </div>
  );
}
