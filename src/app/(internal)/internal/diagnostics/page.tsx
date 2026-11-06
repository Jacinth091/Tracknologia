import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  deploymentRevision,
  getInternalHealth,
  recordSensitiveInternalAccess,
  requireInternalOperator,
  type InternalHealth,
} from "@/features/internal-operations";
import { getServerConfig } from "@/lib/config/server";
import { InternalServiceUnavailable } from "../_components/internal-service-unavailable";
import {
  formatLatency,
  formatProbeTime,
  HealthStatusBadge,
} from "../_components/health-status";

export const metadata: Metadata = {
  title: "Diagnostics — Tracknologia",
  description: "Deployment provenance and what the console does not observe",
};

const CHECKS = [
  ["application", "Application"],
  ["database", "Database"],
  ["auth", "Authentication"],
  ["email", "Email"],
] as const;

const NOT_OBSERVED = [
  [
    "Independent uptime",
    "Not connected. A monitor outside the app must report downtime; gaps stay unknown rather than healthy.",
  ],
  [
    "Host and database telemetry",
    "Unavailable. CPU, memory and connection counts are only shown where the host exposes a safe API.",
  ],
  [
    "Operation counters",
    "Not implemented. Fixed-category counts are not inferred from silence.",
  ],
  [
    "Incidents",
    "Recorded as GitHub issues; the runbook lives in docs/OPERATIONS.md.",
  ],
] as const;

export default async function DiagnosticsPage() {
  const access = await requireInternalOperator();

  if (access.status === "UNAUTHENTICATED") {
    redirect("/login?redirectTo=%2Finternal%2Fdiagnostics");
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
  let config: ReturnType<typeof getServerConfig> | null = null;
  try {
    health = await getInternalHealth();
    config = getServerConfig();
  } catch {
    console.error("[DIAGNOSTICS_PAGE_FAILURE] diagnostics read threw");
  }

  if (!health || !config) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Internal operations" title="Diagnostics" />
        <Card className="p-5 text-sm text-muted-foreground">
          Diagnostics are unavailable right now. Try again in a moment.
        </Card>
      </div>
    );
  }

  const revision = deploymentRevision();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Internal operations"
        title="Diagnostics"
        description="Deployment provenance, raw probe values, and what is not observed."
        actions={
          <Link
            href="/internal/diagnostics"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Refresh
          </Link>
        }
      />

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-semibold">Deployment</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Revision</dt>
            <dd className="font-mono text-foreground">
              {revision ?? "Not reported by this runtime"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Runtime</dt>
            <dd className="text-foreground">{config.runtime}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Application origin</dt>
            <dd className="break-all text-foreground">{config.app.origin}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Diagnostics retention</dt>
            <dd className="text-foreground">
              7 days approved (#87). No automatic deletion; owner reviews
              monthly.
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <div className="space-y-1 p-4 sm:p-5">
          <h2 className="text-base font-semibold">Probe detail</h2>
          <p className="text-sm text-muted-foreground">
            Raw values behind the{" "}
            <Link
              href="/internal/health"
              className="font-medium underline underline-offset-4"
            >
              Health
            </Link>{" "}
            summary.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Service
                </th>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Latency
                </th>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                  Observed
                </th>
              </tr>
            </thead>
            <tbody>
              {CHECKS.map(([key, label]) => {
                const check = health[key];
                return (
                  <tr
                    key={key}
                    className="border-b border-border last:border-0"
                  >
                    <th scope="row" className="px-4 py-3 font-medium sm:px-5">
                      {label}
                    </th>
                    <td className="px-4 py-3 sm:px-5">
                      <HealthStatusBadge status={check.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums sm:px-5">
                      {formatLatency(check.latencyMs)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground sm:px-5">
                      {check.observedAt
                        ? formatProbeTime(check.observedAt)
                        : "Not probed"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-semibold">Ingress and email</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Client IP source</dt>
            <dd className="text-foreground">
              {config.publicAbuse.clientIpSource === "vercel"
                ? "Vercel forwarded IP"
                : "Trusted proxy proof header"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email transport</dt>
            <dd className="text-foreground">
              {config.email.isDevLogger
                ? "Dev logger (console)"
                : config.email.smtp
                  ? "SMTP configured"
                  : "Not configured"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email confirmation</dt>
            <dd className="text-foreground">
              {config.auth.requireEmailConfirmation
                ? "Required"
                : "Not required"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Shared dev bucket</dt>
            <dd className="text-foreground">
              {config.publicAbuse.sharedDevBucket ? "Enabled" : "Disabled"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-semibold">Not observed</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {NOT_OBSERVED.map(([term, detail]) => (
            <div key={term}>
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Probed {formatProbeTime(health.checkedAt)} (Asia/Manila). No
        auto-refresh. Restricted to enabled internal operators, and each view is
        recorded in the internal access audit.
      </p>
    </div>
  );
}
