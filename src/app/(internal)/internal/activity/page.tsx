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
    <ActivityShell
      period={period}
      start={start}
      end={end}
      summary={
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Period (Asia/Manila): {metrics.window.startDate} to{" "}
            {metrics.window.endDateExclusive} (end exclusive),{" "}
            {metrics.window.days} days. Generated (Asia/Manila):{" "}
            {formatTimestamp(metrics.asOf)}.
          </p>
          <details>
            <summary className="cursor-pointer rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              Data coverage &amp; retention
            </summary>
            <div className="pt-4">
              <CoverageNotes coverage={metrics.coverage} />
            </div>
          </details>
        </div>
      }
    >
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

      <section
        className="space-y-4"
        aria-labelledby="providers-activity-heading"
      >
        <div>
          <h2
            id="providers-activity-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Providers &amp; activity
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who is using Tracknologia, and how often they return.
          </p>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <ChartCard
            title="Providers & staff"
            description="All-time Provider accounts and current Staff memberships"
          >
            <div className="grid items-center gap-6 sm:grid-cols-2">
              <div className="space-y-5">
                {" "}
                <InlineStats
                  items={[
                    {
                      label: "Providers (all time)",
                      value: formatCount(metrics.providers.allTime.total),
                      detail: `+${metrics.providers.onboardedInPeriod.total} this period`,
                    },
                  ]}
                />
                <div className="space-y-3 border-t border-border pt-4">
                  <h4 className="text-sm font-medium">
                    Staff ? current memberships
                  </h4>{" "}
                  <InlineStats
                    items={[
                      {
                        label: "Active memberships (now)",
                        value: formatCount(metrics.staff.memberships),
                      },
                      {
                        label: "Shops with staff (now)",
                        value: formatCount(metrics.staff.shopsWithStaff),
                      },
                    ]}
                  />
                </div>
              </div>
              <div className="min-w-0">
                {" "}
                <Donut
                  title="Providers by type"
                  rows={providerDonut}
                  emptyMessage="No providers yet"
                />
              </div>
            </div>
          </ChartCard>
          <ChartCard
            title="Provider activity"
            description="Active and repeat Providers in the selected period"
          >
            <InlineStats
              items={[
                {
                  label: "Active providers",
                  value: formatCount(metrics.activity.distinctProviders),
                },
                {
                  label: "Repeat providers (2 or more days)",
                  value: formatCount(metrics.activity.repeatProviders),
                },
              ]}
            />

            <div className="grid items-center gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <h4 className="text-sm font-medium">
                  Active providers per day
                </h4>{" "}
                <DailyChart
                  title="Active providers per day"
                  seriesLabel="Active providers"
                  rows={daily}
                />
              </div>
              <div className="min-w-0">
                {" "}
                <RepeatShare percent={repeatShare} />
              </div>
            </div>
          </ChartCard>
        </div>
      </section>
      <section className="space-y-4" aria-labelledby="requests-repairs-heading">
        <div>
          <h2
            id="requests-repairs-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Requests &amp; repairs
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            From incoming requests to repair outcomes. Current status is shown
            separately.
          </p>
        </div>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <ChartCard
            title="Requests"
            description="Submitted requests, decisions and conversion"
          >
            <RankedChart title="Requests funnel" rows={requestFunnel} />
            <InlineStats
              items={[
                {
                  label: "Conversion (submission cohort)",
                  value: formatPercent(metrics.requests.conversionPercent),
                },
                {
                  label: "Mean decision time",
                  value: formatDuration(metrics.requests.meanDecisionSeconds),
                },
              ]}
            />
          </ChartCard>
          <ChartCard
            title="Repairs"
            description="Created, ready and completed in the period; status counts are current"
          >
            <div className="grid items-start gap-6 sm:grid-cols-2">
              <div className="min-w-0 space-y-4">
                {" "}
                <InlineStats
                  items={[
                    {
                      label: "Reached READY",
                      value: formatCount(metrics.repairs.readyReached),
                    },
                    {
                      label: "Completed",
                      value: formatCount(metrics.repairs.completed),
                    },
                  ]}
                />
                <Donut
                  title="Repairs by origin, in period"
                  rows={originDonut}
                  emptyMessage="No repairs in this period"
                />
              </div>
              <div className="min-w-0 space-y-3">
                <h4 className="text-sm font-medium">Repairs by status (now)</h4>{" "}
                <RankedChart
                  title="Repairs by status (now)"
                  rows={statusRows}
                />
              </div>
            </div>
          </ChartCard>
        </div>
      </section>
      <section
        className="space-y-4"
        aria-labelledby="customer-tracking-heading"
      >
        <div>
          <h2
            id="customer-tracking-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Customer tracking
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How customers follow their repairs after intake.
          </p>
        </div>
        <ChartCard
          title="Tracking"
          description="Public tracking views in the period, with all-time adoption"
        >
          <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
              {" "}
              <InlineStats
                items={[
                  {
                    label: "Views in period",
                    value: formatCount(metrics.tracking.periodViews),
                  },
                  {
                    label: "Distinct repairs viewed in period",
                    value: formatCount(metrics.tracking.periodRepairsViewed),
                  },
                ]}
              />
            </div>
            <div>
              {" "}
              <AdoptionGauge percent={metrics.tracking.adoptionPercent} />
            </div>
          </div>
        </ChartCard>
      </section>
      <section className="space-y-4" aria-labelledby="feedback-heading">
        <div>
          <h2
            id="feedback-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Feedback
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What participants reported during the selected period.
          </p>
        </div>
        <ChartCard
          title="Participant feedback"
          description="Daily submissions, categories and current triage status"
        >
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <section
              className="min-w-0 space-y-4"
              aria-labelledby="feedback-daily-heading"
            >
              <h4 id="feedback-daily-heading" className="text-sm font-medium">
                Feedback per day
              </h4>{" "}
              {feedbackDaily ? (
                <DailyChart
                  title="Feedback per day"
                  seriesLabel="Submissions"
                  rows={feedbackDaily}
                />
              ) : (
                <UnavailableState />
              )}
            </section>
            <section
              className="min-w-0 space-y-4"
              aria-labelledby="feedback-category-heading"
            >
              <h4
                id="feedback-category-heading"
                className="text-sm font-medium"
              >
                Feedback by category
              </h4>{" "}
              {categoryRows ? (
                <RankedChart title="Feedback by category" rows={categoryRows} />
              ) : (
                <UnavailableState />
              )}
            </section>
            <section
              className="min-w-0 space-y-4"
              aria-labelledby="feedback-status-heading"
            >
              <h4 id="feedback-status-heading" className="text-sm font-medium">
                Feedback by status
              </h4>{" "}
              {statusDonut ? (
                <Donut
                  title="Feedback by status"
                  rows={statusDonut}
                  emptyMessage="No feedback in this period"
                />
              ) : (
                <UnavailableState />
              )}
            </section>
          </div>
        </ChartCard>
      </section>

      <Card>
        <details>
          <summary className="cursor-pointer rounded-xl px-4 py-4 text-base leading-tight font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
            All numbers
          </summary>
          <div className="space-y-6 border-t border-border px-4 py-5 sm:px-5">
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              The same chart data, grouped for reference. In period means the
              selected dates; now means the current snapshot. N/A means there is
              not enough data to calculate a value.
            </p>
            <div className="grid items-start gap-x-10 gap-y-8 lg:grid-cols-2">
              {allNumberGroups(metrics).map((group) => (
                <AllNumbersGroup key={group.title} group={group} />
              ))}
            </div>
          </div>
        </details>
      </Card>
    </ActivityShell>
  );
}

// Every metric the visual cards show, as label/value pairs. Labels match the
// cards, so the grouped list is the same data in text form.
function allNumberGroups(metrics: ValidationMetrics) {
  const feedback = metrics.feedback;
  const feedbackRows: [string, string][] = feedback
    ? [
        ["Submissions in period", formatCount(feedback.total)],
        ...FEEDBACK_CATEGORY_ORDER.map((category): [string, string] => [
          `Category: ${humanize(category)}`,
          formatCount(feedback.byCategory[category]),
        ]),
        ...FEEDBACK_STATUS_ORDER.map((status): [string, string] => [
          `Status: ${humanize(status)}`,
          formatCount(feedback.byStatus[status]),
        ]),
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
        ["Active providers", formatCount(metrics.activity.distinctProviders)],
        [
          "Repeat providers (2 or more days)",
          formatCount(metrics.activity.repeatProviders),
        ],
      ] as [string, string][],
    },
    {
      title: "Staff",
      rows: [
        ["Active memberships (now)", formatCount(metrics.staff.memberships)],
        ["Shops with staff (now)", formatCount(metrics.staff.shopsWithStaff)],
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
        ["Reached READY in period", formatCount(metrics.repairs.readyReached)],
        ["Completed in period", formatCount(metrics.repairs.completed)],
        ...REPAIR_STATUS_ORDER.map((status): [string, string] => [
          `Status now: ${humanize(status)}`,
          formatCount(metrics.repairs.statusNow[status]),
        ]),
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
    <section className="min-w-0">
      <h3 className="border-b border-border pb-3 text-base font-semibold">
        {group.title}
      </h3>
      <dl className="divide-y divide-border/60">
        {group.rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <dt className="min-w-0 text-sm leading-relaxed text-muted-foreground">
              {label}
            </dt>
            <dd className="max-w-1/2 shrink-0 text-right text-base font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ActivityShell({
  period,
  start,
  end,
  children,
  summary,
}: {
  period: Period;
  start?: string;
  end?: string;
  children: ReactNode;
  summary?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal operations"
        title="Validation metrics"
        actions={
          <>
            <Link
              href={activityHref(period, start, end)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Refresh
            </Link>
          </>
        }
      />
      <Card className="space-y-4 p-4 sm:p-5">
        <PeriodPicker period={period} start={start} end={end} />
        {summary}
      </Card>
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
      aria-describedby="metrics-range-help"
      className="space-y-3"
    >
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="metrics-period">Period</Label>
          <select
            id="metrics-period"
            name="period"
            defaultValue={period}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="metrics-start">Start date</Label>
          <Input
            id="metrics-start"
            name="start"
            type="date"
            defaultValue={start ?? ""}
            className="w-full min-w-0"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="metrics-end">End date (exclusive)</Label>
          <Input
            id="metrics-end"
            name="end"
            type="date"
            defaultValue={end ?? ""}
            className="w-full min-w-0"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="flex-1 sm:flex-none">
            Show period
          </Button>
          <Link
            href="/internal/activity"
            className={buttonVariants({
              variant: "outline",
              className: "flex-1 sm:flex-none",
            })}
          >
            Clear filters
          </Link>
        </div>
      </div>
      <p id="metrics-range-help" className="text-xs text-muted-foreground">
        Dates apply to a Custom period. The end date is excluded.
      </p>
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
    <ul className="grid gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-3">
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
        <h3 className="text-base leading-tight font-semibold">{title}</h3>
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
  // Slots keep their place in the full list; zero slices are not drawn.
  const slices = categorical(rows).filter((row) => row.value > 0);

  if (slices.length === 0) {
    return <NoneState message={emptyMessage} />;
  }

  return <DonutChart summary={breakdownSummary(title, slices)} data={slices} />;
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
    <div className="py-6">
      <p className="text-2xl font-semibold tabular-nums">N/A</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// An empty chart area is one muted line, not a block filling the card.
function NoneState({ message }: { message: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{message}</p>;
}

function UnavailableState() {
  return (
    <p className="py-6 text-sm text-muted-foreground">
      Unavailable for this period.
    </p>
  );
}

// Compact numbers for a chart card: no border, icon or stripe.
function InlineStats({
  items,
}: {
  items: { label: string; value: string; detail?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
          <p className="text-xs text-muted-foreground">{item.label}</p>
          {item.detail ? (
            <p className="text-xs text-muted-foreground">{item.detail}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
