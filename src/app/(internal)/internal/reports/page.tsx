import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getValidationMetrics,
  MetricsError,
  REPORT_GLOSSARY,
  requireInternalOperator,
} from "@/features/internal-operations";
import { InternalServiceUnavailable } from "../_components/internal-service-unavailable";
import { formatTimestamp } from "../_components/format";
import {
  firstSearchParam,
  nonEmptyParam,
  periodHref,
  selectedPeriod,
  windowInput,
} from "../_components/metrics-period";
import { PeriodPicker } from "../_components/metrics-period-picker";

export const metadata: Metadata = {
  title: "Validation reports — Tracknologia",
  description: "Count-only validation exports for the pilot report",
};

function exportHref(
  format: "csv" | "json",
  period: ReturnType<typeof selectedPeriod>,
  start?: string,
  end?: string,
) {
  const params = new URLSearchParams({ format, period });
  if (period === "custom") {
    if (start) params.set("start", start);
    if (end) params.set("end", end);
  }
  return `/internal/reports/export?${params.toString()}`;
}

export default async function ReportsPage({
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

  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal%2Freports");
  }

  if (access.status === "FORBIDDEN") {
    notFound();
  }

  if (access.status === "UNAVAILABLE") {
    return <InternalServiceUnavailable />;
  }

  let metrics;
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
        <div className="space-y-8">
          <PageHeader
            eyebrow="Internal operations"
            title="Validation reports"
          />
          <Card className="p-5 text-sm">
            That period isn&apos;t valid. Choose today, 7 or 30 days, or a
            custom range up to 90 days.
          </Card>
        </div>
      );
    }
    throw error;
  }

  const feedbackStatus = metrics.coverage.feedback.status;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal operations"
        title="Validation reports"
        description="Count-only exports for the pilot report."
        actions={
          <Link
            href={periodHref("/internal/reports", period, start, end)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Refresh
          </Link>
        }
      />

      <Card className="space-y-4 p-4 sm:p-5">
        <PeriodPicker
          action="/internal/reports"
          period={period}
          start={start}
          end={end}
        />
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-semibold">Export</h2>
        <p className="text-sm text-muted-foreground">
          Counts only. No Provider, Customer, feedback or authentication
          identifiers leave this page.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={exportHref("csv", period, start, end)}
            className={buttonVariants({ variant: "outline" })}
          >
            Download CSV
          </Link>
          <Link
            href={exportHref("json", period, start, end)}
            className={buttonVariants({ variant: "outline" })}
          >
            Download JSON
          </Link>
        </div>
        <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">Window</dt>
            <dd>
              {metrics.window.startDate} to {metrics.window.endDateExclusive}{" "}
              (end excluded), {metrics.window.days}{" "}
              {metrics.window.days === 1 ? "day" : "days"} in{" "}
              {metrics.window.timeZone}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Generated at</dt>
            <dd>
              {formatTimestamp(metrics.asOf)} (domain snapshot; Feedback is{" "}
              {feedbackStatus === "AVAILABLE" ? "available" : "unavailable"})
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Counts from 1 to 4 are suppressed as &lt;5, including the total a
          suppressed part would reveal. Retention policy: approved (#87).
        </p>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-semibold">Glossary</h2>
        <dl className="grid gap-3 text-sm leading-relaxed sm:grid-cols-2">
          {REPORT_GLOSSARY.map(({ term, definition }) => (
            <div key={term} className="space-y-1">
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{definition}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
