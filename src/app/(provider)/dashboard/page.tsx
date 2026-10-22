import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Tick02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { requireProviderContext } from "@/features/auth";
import {
  getRepairCounts,
  listRepairs,
  type RepairStatus,
  type RepairSummary,
} from "@/features/repairs";
import {
  listRepairRequests,
  type RepairRequestStatus,
  type RepairRequestSummary,
} from "@/features/repair-requests";
import { StatusGauge } from "@/components/shared/status-gauge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { repairStatusLabel } from "./_components/repair-status-badge";

export const metadata: Metadata = {
  title: "Dashboard — Tracknologia",
  description: "Provider Dashboard Overview",
};

type AttentionRow = {
  key: string;
  href: string;
  title: string;
  meta: string;
  status: RepairStatus | RepairRequestStatus;
  badge: string;
};

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function repairRow(repair: RepairSummary): AttentionRow {
  const device =
    [repair.brand, repair.model].filter(Boolean).join(" ") || repair.deviceType;
  return {
    key: repair.id,
    href: `/dashboard/repairs/${repair.id}`,
    title: `${device} · ${repair.reportedProblem}`,
    meta: `${repair.ticketNumber} · ${repair.customerName} · ${shortDate(repair.updatedAt)}`,
    status: repair.currentStatus,
    badge: repairStatusLabel(repair.currentStatus),
  };
}

function requestRow(request: RepairRequestSummary): AttentionRow {
  const device =
    [request.brand, request.model].filter(Boolean).join(" ") ||
    request.deviceType;
  return {
    key: request.id,
    href: `/dashboard/requests/${request.id}`,
    title: `${device} · ${request.reportedProblem}`,
    meta: `${request.referenceCode} · ${request.customerName} · ${shortDate(request.submittedAt)}`,
    status: request.status,
    badge: "New request",
  };
}

export default async function DashboardPage() {
  const [context, repairCounts, readyRepairs, approvalRepairs, newRequests] =
    await Promise.all([
      requireProviderContext(),
      getRepairCounts(),
      listRepairs({ status: "READY" }),
      listRepairs({ status: "AWAITING_APPROVAL" }),
      listRepairRequests({ status: "SUBMITTED" }),
    ]);

  const providerTypeLabel =
    context.providerType === "INDEPENDENT"
      ? "Independent Repairer"
      : "Repair Shop";

  const tiles = [
    {
      label: "Active",
      count: repairCounts.active,
      href: "/dashboard/repairs?status=IN_PROGRESS",
      status: "IN_PROGRESS" as const,
      icon: Wrench01Icon,
    },
    {
      label: "Waiting",
      count: repairCounts.waiting,
      href: "/dashboard/repairs?status=WAITING",
      status: "WAITING_FOR_PARTS" as const,
      icon: Clock01Icon,
    },
    {
      label: "Ready",
      count: repairCounts.ready,
      href: "/dashboard/repairs?status=READY",
      status: "READY" as const,
      icon: CheckmarkCircle02Icon,
    },
    {
      label: "Completed",
      count: repairCounts.completed,
      href: "/dashboard/repairs?status=COMPLETED",
      status: "COMPLETED" as const,
      icon: Tick02Icon,
    },
  ];

  // Groups in priority order; the list shows at most five rows in total.
  const allGroups = [
    {
      label: "Ready for handover",
      href: "/dashboard/repairs?status=READY",
      rows: readyRepairs.items.map(repairRow),
    },
    {
      label: "Needs customer approval",
      href: "/dashboard/repairs?status=AWAITING_APPROVAL",
      rows: approvalRepairs.items.map(repairRow),
    },
    {
      label: "New requests",
      href: "/dashboard/requests?status=SUBMITTED",
      rows: newRequests.items.map(requestRow),
    },
  ];
  let remaining = 5;
  const groups = allGroups
    .map((group) => {
      const rows = group.rows.slice(0, remaining);
      remaining -= rows.length;
      return { ...group, rows };
    })
    .filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Dashboard
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-foreground wrap-anywhere sm:text-4xl">
            {context.providerName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{providerTypeLabel}</Badge>
            <span className="wrap-anywhere">{context.email}</span>
          </div>
        </div>
        <Link
          href="/dashboard/repairs/new"
          className={cn(buttonVariants(), "min-h-11 w-full gap-2 sm:w-auto")}
        >
          <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
          Create Repair
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="group">
            <Card className="relative h-full overflow-hidden transition-colors group-hover:border-input">
              <span
                aria-hidden="true"
                data-status={tile.status}
                className="status-badge absolute inset-x-0 top-0 h-1 bg-current"
              />
              <CardHeader className="gap-3 p-4 sm:p-5">
                <span
                  data-status={tile.status}
                  className="status-badge flex size-9 items-center justify-center rounded-lg"
                >
                  <HugeiconsIcon
                    icon={tile.icon}
                    aria-hidden="true"
                    className="size-4"
                  />
                </span>
                <CardDescription>{tile.label} Repairs</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {tile.count}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <section aria-labelledby="needs-attention" className="space-y-3">
        <h2
          id="needs-attention"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          Needs attention
        </h2>

        {groups.length === 0 ? (
          <Empty className="rounded-xl border border-border bg-card p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  aria-hidden="true"
                />
              </EmptyMedia>
              <EmptyTitle>You&apos;re all caught up</EmptyTitle>
              <EmptyDescription>
                Nothing is waiting on you right now.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              <Link
                href="/dashboard/repairs"
                className={buttonVariants({ variant: "outline" })}
              >
                Open Repairs
              </Link>
              <Link
                href="/dashboard/requests"
                className={buttonVariants({ variant: "ghost" })}
              >
                Review Requests
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <Card className="overflow-hidden p-0">
            {groups.map((group) => (
              <div
                key={group.label}
                className="border-b border-border last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2 sm:px-5">
                  <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  <Link
                    href={group.href}
                    className="shrink-0 text-xs font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <ul className="divide-y divide-border">
                  {group.rows.map((row) => (
                    <li key={row.key}>
                      <Link
                        href={row.href}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5"
                      >
                        <StatusGauge
                          status={row.status}
                          className="size-5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">
                            {row.title}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {row.meta}
                          </p>
                        </div>
                        <span
                          data-status={row.status}
                          className="status-badge shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
                        >
                          {row.badge}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
