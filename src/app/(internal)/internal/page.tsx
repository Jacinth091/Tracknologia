import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Message01Icon,
  Store01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { FeedbackError, getNewFeedbackCount } from "@/features/feedback";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getValidationMetrics,
  MetricsError,
  recordSensitiveInternalAccess,
  requireInternalOperator,
  type ValidationMetrics,
} from "@/features/internal-operations";
import { InternalServiceUnavailable } from "./_components/internal-service-unavailable";
import {
  dailySeries,
  dailySummary,
  hasActivity,
} from "./_components/chart-data";
import { DayBarChart } from "./_components/metric-charts";
import { StatTile } from "./_components/stat-tile";

function formatCount(value: number) {
  return value.toLocaleString("en-PH");
}

export default async function InternalPage() {
  // The layout guard is not sufficient by itself: every sensitive internal
  // page operation re-runs the same fail-closed access check.
  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal");
  }

  if (access.status === "FORBIDDEN") {
    notFound();
  }

  if (access.status === "UNAVAILABLE") {
    return <InternalServiceUnavailable />;
  }

  // Feature reads audit themselves; the page audits its fallback links only.
  let metrics: ValidationMetrics | null = null;
  let newFeedbackCount: number | null = null;
  try {
    metrics = await getValidationMetrics({ mode: "7d" });
  } catch (error) {
    if (error instanceof MetricsError && error.code === "FORBIDDEN") {
      notFound();
    }
    // The numbers failed, but the links still need a required audit first.
    const audited = await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW");

    if (!audited) {
      return <InternalServiceUnavailable />;
    }
  }

  if (metrics) {
    try {
      newFeedbackCount = await getNewFeedbackCount();
    } catch (error) {
      if (error instanceof FeedbackError && error.code === "FORBIDDEN") {
        notFound();
      }
      newFeedbackCount = null;
    }
  }

  const openRepairs = metrics
    ? Object.entries(metrics.repairs.statusNow)
        .filter(([status]) => status !== "COMPLETED")
        .reduce((sum, [, count]) => sum + count, 0)
    : 0;
  const daily = metrics
    ? dailySeries(
        metrics.activity.daily.map((day) => ({
          date: day.date,
          value: day.distinctProviders,
        })),
      )
    : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal operations"
        title="Overview"
        description="A quick look at Providers, repairs, and participant feedback."
        actions={
          <Link
            href="/internal/feedback?status=NEW"
            className={buttonVariants()}
          >
            Review feedback
          </Link>
        }
      />
      {metrics ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              href="/internal/activity"
              label="Providers (all time)"
              value={formatCount(metrics.providers.allTime.total)}
              status="ACCEPTED"
              icon={Store01Icon}
            />
            <StatTile
              href="/internal/activity"
              label="Open repairs (now)"
              value={formatCount(openRepairs)}
              status="IN_PROGRESS"
              icon={Wrench01Icon}
            />
            <StatTile
              href="/internal/activity"
              label="Pending requests (now)"
              value={formatCount(metrics.requests.pendingNow)}
              status="SUBMITTED"
              icon={Clock01Icon}
            />
            <StatTile
              href="/internal/feedback?status=NEW"
              label="New feedback (now)"
              value={
                newFeedbackCount !== null
                  ? formatCount(newFeedbackCount)
                  : "Unavailable"
              }
              status="AWAITING_APPROVAL"
              icon={Message01Icon}
            />
          </div>

          <Card>
            <CardHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>
                  <h2 className="text-base font-semibold">
                    Active providers, last 7 days
                  </h2>
                </CardTitle>
                <Link
                  href="/internal/activity"
                  className="text-sm font-medium underline underline-offset-4"
                >
                  View validation metrics
                </Link>
              </div>
              <CardDescription>
                Providers with a repair, decision or status change each day
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 pb-4 sm:px-3 sm:pb-5">
              {hasActivity(daily) ? (
                <DayBarChart
                  seriesLabel="Active providers"
                  summary={dailySummary("Active providers, last 7 days", daily)}
                  data={daily}
                />
              ) : (
                <div className="mx-2 flex items-start gap-3 rounded-lg bg-muted/40 px-4 py-5 sm:mx-3">
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    strokeWidth={1.8}
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      No provider activity in the last 7 days
                    </p>
                    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                      Activity appears here once providers create repairs,
                      decide requests or change status.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Numbers are unavailable right now. Try again in a moment.
          </p>
        </Card>
      )}
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Restricted to enabled internal operators. Access is recorded in the
        append-only internal access audit.
      </p>
    </div>
  );
}
