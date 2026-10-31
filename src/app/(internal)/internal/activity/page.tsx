import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Message01Icon,
  Search01Icon,
  Store01Icon,
  Tick02Icon,
  Ticket01Icon,
  UserGroupIcon,
  UserIcon,
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
  breakdownSummary,
  categorical,
  dailySeries,
  dailySummary,
  hasActivity,
  percentSummary,
  rankedSummary,
  type ChartRow,
} from "../_components/chart-data";
import {
  CategoryBarChart,
  DayBarChart,
  DonutChart,
  GaugeChart,
} from "../_components/metric-charts";
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

const FEEDBACK_STATUS_ORDER = [
  "NEW",
  "REVIEWING",
  "PLANNED",
  "RESOLVED",
  "DISMISSED",
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
  const statusDonut = metrics.feedback
    ? FEEDBACK_STATUS_ORDER.map((status) => ({
        key: status,
        label: humanize(status),
        value: metrics.feedback?.byStatus[status] ?? 0,
      }))
    : null;
  const providerDonut = [
    {
      key: "SHOP",
      label: "Shop",
      value: metrics.providers.allTime.shop,
    },
    {
      key: "INDEPENDENT",
      label: "Independent",
      value: metrics.providers.allTime.independent,
    },
  ];
  const originDonut = [
    {
      key: "CUSTOMER_REQUEST",
      label: "From customer request",
      value: metrics.repairs.created.customerRequest,
    },
    {
      key: "PROVIDER_CREATED",
      label: "Provider created",
      value: metrics.repairs.created.providerCreated,
    },
  ];
  const requestFunnel = [
    { key: "RECEIVED", label: "Received", value: metrics.requests.received },
    {
      key: "DECIDED",
      label: "Decided",
      value: metrics.requests.decided.total,
    },
    {
      key: "ACCEPTED",
      label: "Accepted",
      value: metrics.requests.decided.accepted,
    },
    {
      key: "DECLINED",
      label: "Declined",
      value: metrics.requests.decided.declined,
    },
  ];
  const active = metrics.activity.distinctProviders;
  const repeatShare =
    active > 0
      ? Math.round((metrics.activity.repeatProviders / active) * 100)
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Providers"
          description="All-time Provider accounts by type"
        >
          <div className="grid gap-3">
            <StatTile
              label="Providers (all time)"
              value={formatCount(metrics.providers.allTime.total)}
              detail={`+${metrics.providers.onboardedInPeriod.total} this period`}
              status="ACCEPTED"
              icon={Store01Icon}
            />
          </div>
          <Donut
            title="Providers by type"
            rows={providerDonut}
            emptyMessage="No providers yet"
          />
        </ChartCard>

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
          title="Activity"
          description="Providers active in the period and how many came back"
        >
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Active providers"
              value={formatCount(metrics.activity.distinctProviders)}
              status="IN_PROGRESS"
              icon={UserGroupIcon}
            />
            <StatTile
              label="Repeat providers (2 or more days)"
              value={formatCount(metrics.activity.repeatProviders)}
              status="SUBMITTED"
              icon={UserGroupIcon}
            />
          </div>
          <RepeatShare percent={repeatShare} />
        </ChartCard>

        <ChartCard
          title="Staff"
          description="Current memberships, not windowed"
        >
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Active memberships (now)"
              value={formatCount(metrics.staff.memberships)}
              status="COMPLETED"
              icon={UserIcon}
            />
            <StatTile
              label="Shops with staff (now)"
              value={formatCount(metrics.staff.shopsWithStaff)}
              status="COMPLETED"
              icon={UserIcon}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Repairs by status (now)"
          description="Current Repair status, in lifecycle order"
        >
          <RankedChart title="Repairs by status (now)" rows={statusRows} />
        </ChartCard>

        <ChartCard
          title="Repairs"
          description="Repairs created, ready and completed in the period"
        >
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Created"
              value={formatCount(metrics.repairs.created.total)}
              status="IN_PROGRESS"
              icon={Wrench01Icon}
            />
            <StatTile
              label="Reached READY"
              value={formatCount(metrics.repairs.readyReached)}
              status="READY"
              icon={CheckmarkCircle02Icon}
            />
            <StatTile
              label="Completed"
              value={formatCount(metrics.repairs.completed)}
              status="COMPLETED"
              icon={Tick02Icon}
            />
          </div>
          <Donut
            title="Repairs by origin, in period"
            rows={originDonut}
            emptyMessage="No repairs in this period"
          />
        </ChartCard>

        <ChartCard
          title="Requests"
          description="Submitted requests, decisions and conversion"
        >
          <RankedChart title="Requests funnel" rows={requestFunnel} />
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Conversion (submission cohort)"
              value={formatPercent(metrics.requests.conversionPercent)}
              status="SUBMITTED"
              icon={Ticket01Icon}
            />
            <StatTile
              label="Mean decision time"
              value={formatDuration(metrics.requests.meanDecisionSeconds)}
              status="SUBMITTED"
              icon={Clock01Icon}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Tracking"
          description="Public tracking views and how many repairs were looked up"
        >
          <AdoptionGauge percent={metrics.tracking.adoptionPercent} />
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Views in period"
              value={formatCount(metrics.tracking.periodViews)}
              status="IN_PROGRESS"
              icon={Search01Icon}
            />
            <StatTile
              label="Distinct repairs viewed in period"
              value={formatCount(metrics.tracking.periodRepairsViewed)}
              status="IN_PROGRESS"
              icon={Wrench01Icon}
            />
          </div>
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
          title="Feedback by category"
          description="Feedback submissions in the period, by category"
        >
          {categoryRows ? (
            <RankedChart title="Feedback by category" rows={categoryRows} />
          ) : (
            <UnavailableState />
          )}
        </ChartCard>

        <ChartCard
          title="Feedback by status"
          description="Current status of feedback submitted in the period"
        >
          {statusDonut ? (
            <Donut
              title="Feedback by status"
              rows={statusDonut}
              emptyMessage="No feedback in this period"
            />
          ) : (
            <UnavailableState />
          )}
        </ChartCard>
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer px-4 py-4 text-base leading-tight font-semibold sm:px-5">
            All numbers
          </summary>
          <div className="overflow-x-auto px-4 pb-4 sm:px-5 sm:pb-5">
            <table className="w-full text-sm">
              <tbody>
                {allNumberGroups(metrics).map((group) => (
                  <AllNumbersGroup key={group.title} group={group} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    </ActivityShell>
  );
}

// Every metric the visual cards show, as label/value pairs. Labels match the
// cards, so the table is the same data in text form.
function allNumberGroups(metrics: ValidationMetrics) {
  const feedback = metrics.feedback;
  const feedbackRows: [string, string][] = feedback
    ? [
        ["Submissions in period", formatCount(feedback.total)],
        ...FEEDBACK_CATEGORY_ORDER.map(
          (category): [string, string] => [
            `Category: ${humanize(category)}`,
            formatCount(feedback.byCategory[category]),
          ],
        ),
        ...FEEDBACK_STATUS_ORDER.map(
          (status): [string, string] => [
            `Status: ${humanize(status)}`,
            formatCount(feedback.byStatus[status]),
          ],
        ),
      ]
    : [["Feedback", "Unavailable for this period."]];

  return [
    {
      title: "Providers",
      rows: [
        [
          "Onboarded in period (total)",
          formatCount(metrics.providers.onboardedInPeriod.total),
        ],
        [
          "Onboarded in period (shop)",
          formatCount(metrics.providers.onboardedInPeriod.shop),
        ],
        [
          "Onboarded in period (independent)",
          formatCount(metrics.providers.onboardedInPeriod.independent),
        ],
        ["All time (total)", formatCount(metrics.providers.allTime.total)],
        ["All time (shop)", formatCount(metrics.providers.allTime.shop)],
        [
          "All time (independent)",
          formatCount(metrics.providers.allTime.independent),
        ],
      ] as [string, string][],
    },
    {
      title: "Activity",
      rows: [
        [
          "Active providers",
          formatCount(metrics.activity.distinctProviders),
        ],
        [
          "Repeat providers (2 or more days)",
          formatCount(metrics.activity.repeatProviders),
        ],
      ] as [string, string][],
    },
    {
      title: "Staff",
      rows: [
        [
          "Active memberships (now)",
          formatCount(metrics.staff.memberships),
        ],
        ["Shops with staff (now)", formatCount(metrics.staff.shopsWithStaff)],
      ] as [string, string][],
    },
    {
      title: "Repairs",
      rows: [
        ["Created in period", formatCount(metrics.repairs.created.total)],
        [
          "From customer request",
          formatCount(metrics.repairs.created.customerRequest),
        ],
        [
          "Provider created",
          formatCount(metrics.repairs.created.providerCreated),
        ],
        [
          "Reached READY in period",
          formatCount(metrics.repairs.readyReached),
        ],
        ["Completed in period", formatCount(metrics.repairs.completed)],
        ...REPAIR_STATUS_ORDER.map(
          (status): [string, string] => [
            `Status now: ${humanize(status)}`,
            formatCount(metrics.repairs.statusNow[status]),
          ],
        ),
      ] as [string, string][],
    },
    {
      title: "Requests",
      rows: [
        ["Received in period", formatCount(metrics.requests.received)],
        ["Decided in period", formatCount(metrics.requests.decided.total)],
        ["Accepted", formatCount(metrics.requests.decided.accepted)],
        ["Declined", formatCount(metrics.requests.decided.declined)],
        ["Pending (now)", formatCount(metrics.requests.pendingNow)],
        [
          "Conversion (submission cohort)",
          formatPercent(metrics.requests.conversionPercent),
        ],
        [
          "Mean decision time",
          formatDuration(metrics.requests.meanDecisionSeconds),
        ],
      ] as [string, string][],
    },
    {
      title: "Tracking",
      rows: [
        ["Views in period", formatCount(metrics.tracking.periodViews)],
        [
          "Distinct repairs viewed in period",
          formatCount(metrics.tracking.periodRepairsViewed),
        ],
        [
          "Adoption (all time)",
          formatPercent(metrics.tracking.adoptionPercent),
        ],
      ] as [string, string][],
    },
    { title: "Feedback", rows: feedbackRows },
  ];
}

function AllNumbersGroup({
  group,
}: {
  group: { title: string; rows: [string, string][] };
}) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={2}
          className="pt-4 pb-1 text-left font-mono text-xs tracking-wider text-muted-foreground uppercase"
        >
          {group.title}
        </th>
      </tr>
      {group.rows.map(([label, value]) => (
        <tr key={label} className="border-b border-border last:border-b-0">
          <th scope="row" className="py-2 pr-4 text-left font-normal">
            {label}
          </th>
          <td className="py-2 text-right font-semibold tabular-nums">
            {value}
          </td>
        </tr>
      ))}
    </>
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
      <CardContent className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
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
    return <NoneState message="No activity in this period" />;
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
    return <NoneState message="No activity in this period" />;
  }

  return (
    <CategoryBarChart
      summary={rankedSummary(title, rows)}
      data={rows.map((row) => ({ ...row, color: "var(--chart-cat-1)" }))}
    />
  );
}

function Donut({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: { key: string; label: string; value: number }[];
  emptyMessage: string;
}) {
  if (!hasActivity(rows)) {
    return <NoneState message={emptyMessage} />;
  }

  return (
    <DonutChart
      summary={breakdownSummary(title, rows)}
      data={categorical(rows)}
    />
  );
}

function RepeatShare({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <NoneValue label="Repeat share" />;
  }

  return (
    <GaugeChart
      summary={percentSummary("Repeat share", percent)}
      label="Repeat share"
      percent={percent}
    />
  );
}

function AdoptionGauge({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <NoneValue label="Adoption (all time)" />;
  }

  return (
    <GaugeChart
      summary={percentSummary("Adoption (all time)", percent)}
      label="Adoption (all time)"
      percent={percent}
    />
  );
}

function NoneValue({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-1">
      <p className="text-3xl font-semibold tabular-nums">N/A</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function NoneState({ message }: { message: string }) {
  return (
    <Empty className="min-h-48 p-6">
      <EmptyHeader>
        <EmptyTitle>{message}</EmptyTitle>
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
