import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  getValidationMetrics,
  MetricsError,
  recordSensitiveInternalAccess,
  requireInternalOperator,
  type ValidationMetrics,
} from "@/features/internal-operations";
import { InternalServiceUnavailable } from "./_components/internal-service-unavailable";
import { DailyColumns } from "./_components/charts";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  // Required audit must succeed before any protected content renders.
  const audited = await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW");

  if (!audited) {
    return <InternalServiceUnavailable />;
  }

  // Same 7-day read as the activity page; it records its own view audit.
  let metrics: ValidationMetrics;
  try {
    metrics = await getValidationMetrics({ mode: "7d" });
  } catch (error) {
    if (error instanceof MetricsError && error.code === "FORBIDDEN") {
      notFound();
    }
    if (error instanceof MetricsError) {
      return <InternalServiceUnavailable />;
    }
    throw error;
  }

  const openRepairs = Object.entries(metrics.repairs.statusNow)
    .filter(([status]) => status !== "COMPLETED")
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        Internal operations
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        This private area is limited to enabled internal operators, and operator
        access is recorded in the append-only internal access audit.
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="space-y-1 p-5">
          <p className="text-sm text-muted-foreground">Providers (all time)</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCount(metrics.providers.allTime.total)}
          </p>
        </Card>
        <Card className="space-y-1 p-5">
          <p className="text-sm text-muted-foreground">Open repairs (now)</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCount(openRepairs)}
          </p>
        </Card>
        <Card className="space-y-1 p-5">
          <p className="text-sm text-muted-foreground">
            Pending requests (now)
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCount(metrics.requests.pendingNow)}
          </p>
        </Card>
        <Card className="space-y-1 p-5">
          <p className="text-sm text-muted-foreground">New feedback (now)</p>
          <p className="text-2xl font-semibold tabular-nums">
            {metrics.feedback
              ? formatCount(metrics.feedback.byStatus.NEW)
              : "Unavailable"}
          </p>
        </Card>
      </div>
      <Card className="space-y-3 p-5">
        <DailyColumns
          title="Active providers, last 7 days"
          days={metrics.activity.daily.map((day) => ({
            date: day.date,
            value: day.distinctProviders,
          }))}
          unit={{ singular: "active provider", plural: "active providers" }}
        />
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/internal/feedback"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex",
          )}
        >
          Feedback Inbox
        </Link>
        <Link
          href="/internal/activity"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex",
          )}
        >
          Validation metrics
        </Link>
      </div>
    </section>
  );
}
