import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getInternalHealth,
  recordSensitiveInternalAccess,
  requireInternalOperator,
  type HealthCheck,
  type HealthStatus,
  type InternalHealth,
} from "@/features/internal-operations";
import { InternalServiceUnavailable } from "../_components/internal-service-unavailable";
import {
  formatLatency,
  formatProbeTime,
  HealthStatusBadge,
} from "../_components/health-status";

export const metadata: Metadata = {
  title: "Service health — Tracknologia",
  description:
    "Truthful operator view of application, database, auth and email",
};

const CHECKS = [
  [
    "application",
    "Application",
    "This page rendered, so the Next.js process answered.",
  ],
  ["database", "Database", "Bounded, head-only read of a single Provider row."],
  ["auth", "Authentication", "Supabase Auth health endpoint."],
  [
    "email",
    "Email",
    "SMTP is never reported healthy without a real delivery probe.",
  ],
] as const;

function emailDetail(status: HealthStatus): string | null {
  if (status === "unknown") {
    return "SMTP is configured, but deliveries are not probed from this page.";
  }
  if (status === "unavailable") {
    return "No email transport is configured, so email cannot send.";
  }
  return null;
}

export default async function HealthPage() {
  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal%2Fhealth");
  }

  if (access.status === "FORBIDDEN") {
    notFound();
  }

  if (access.status === "UNAVAILABLE") {
    return <InternalServiceUnavailable />;
  }

  if (!(await recordSensitiveInternalAccess("INTERNAL_ACCESS_VIEW"))) {
    return <InternalServiceUnavailable />;
  }

  let health: InternalHealth | null = null;
  try {
    health = await getInternalHealth();
  } catch {
    console.error("[HEALTH_PAGE_FAILURE] health checks threw");
  }

  if (!health) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Internal operations" title="Service health" />
        <Card className="p-5 text-sm text-muted-foreground">
          Health checks are unavailable right now. Try again in a moment.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal operations"
        title="Service health"
        description="What the application can verify right now, and what it cannot see."
        actions={
          <Link
            href="/internal/health"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Refresh
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {CHECKS.map(([key, label, detail]) => {
          const check: HealthCheck = health[key];
          return (
            <Card key={key} className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{label}</h2>
                <HealthStatusBadge status={check.status} />
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {key === "email"
                  ? (emailDetail(check.status) ?? detail)
                  : detail}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <dt>Latency</dt>
                  <dd className="tabular-nums text-foreground">
                    {formatLatency(check.latencyMs)}
                  </dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd className="text-foreground">
                    {check.observedAt
                      ? formatProbeTime(check.observedAt)
                      : "Not probed"}
                  </dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Independent uptime, host telemetry and operation counters are not
        connected yet.{" "}
        <Link
          href="/internal/diagnostics"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Diagnostics
        </Link>{" "}
        lists what is observed and what is not.
      </p>

      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Probed {formatProbeTime(health.checkedAt)} (Asia/Manila). No
        auto-refresh; use Refresh for a new probe. Restricted to enabled
        internal operators, and each view is recorded in the internal access
        audit.
      </p>
    </div>
  );
}
