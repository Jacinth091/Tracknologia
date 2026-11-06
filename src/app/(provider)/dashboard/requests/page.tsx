import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Message01Icon } from "@hugeicons/core-free-icons";

import { StatusGauge } from "@/components/shared/status-gauge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  listRepairRequests,
  repairRequestPageSchema,
  repairRequestStatusEnum,
  type RepairRequestStatus,
} from "@/features/repair-requests";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Repair Requests — Tracknologia",
  description: "Review customer-submitted Repair Requests",
};

const PAGE_SIZE = 25;

const FILTERS: Array<{ label: string; status?: RepairRequestStatus }> = [
  { label: "All" },
  { label: "Submitted", status: "SUBMITTED" },
  { label: "Accepted", status: "ACCEPTED" },
  { label: "Declined", status: "DECLINED" },
];

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deviceLabel(
  deviceType: string,
  brand?: string | null,
  model?: string | null,
) {
  return [brand, model].filter(Boolean).join(" ") || deviceType;
}

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function repairRequestInboxHref(status?: RepairRequestStatus, page = 1) {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return `/dashboard/requests${query ? `?${query}` : ""}`;
}

export default async function RepairRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawStatus = firstSearchParam(params.status);
  const parsedStatus = repairRequestStatusEnum.safeParse(rawStatus);
  const status = parsedStatus.success ? parsedStatus.data : undefined;
  const parsedPage = repairRequestPageSchema.safeParse(
    firstSearchParam(params.page),
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  const requestPage = await listRepairRequests({ status, page });
  const rangeStart = (requestPage.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = rangeStart + requestPage.items.length - 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repair Requests"
        description="Review incoming requests and decide which repairs to take on."
      />

      <nav
        aria-label="Request status filters"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        {FILTERS.map((filter) => {
          const active =
            filter.status === status || (!filter.status && !status);
          const href = repairRequestInboxHref(filter.status);

          return (
            <Link
              key={filter.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 items-center px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {requestPage.items.length === 0 ? (
        <Empty className="rounded-xl border border-border bg-card p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Message01Icon} aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No matching Requests</EmptyTitle>
            <EmptyDescription>
              New customer submissions will appear here for Provider review.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {requestPage.items.map((request) => {
              const device = deviceLabel(
                request.deviceType,
                request.brand,
                request.model,
              );
              return (
                <li key={request.id}>
                  <Link
                    href={`/dashboard/requests/${request.id}`}
                    aria-label={`Review Request: ${device}`}
                    className="flex items-start gap-3 px-4 py-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                  >
                    <StatusGauge
                      status={request.status}
                      className="mt-0.5 size-7 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 basis-40 line-clamp-2 text-sm font-semibold leading-snug text-foreground wrap-anywhere">
                          {device}
                        </p>
                        <span
                          data-status={request.status}
                          className="status-badge shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
                        >
                          {request.status.charAt(0) +
                            request.status.slice(1).toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground wrap-anywhere">
                        {request.reportedProblem}
                      </p>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-mono wrap-anywhere">
                          {request.referenceCode}
                        </span>
                        <span className="wrap-anywhere">
                          {request.customerName}
                        </span>
                        <time
                          dateTime={request.submittedAt}
                          className="tabular-nums"
                        >
                          Submitted {formatSubmittedAt(request.submittedAt)}
                        </time>
                      </div>
                    </div>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {requestPage.items.length > 0 ||
      requestPage.hasPrevious ||
      requestPage.hasNext ? (
        <nav
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
          aria-label="Repair Request pagination"
        >
          {requestPage.hasPrevious ? (
            <Link
              href={repairRequestInboxHref(status, requestPage.page - 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-11 min-w-20 sm:min-h-8 sm:min-w-24",
              )}
            >
              Previous
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none min-h-11 min-w-20 opacity-50 sm:min-h-8 sm:min-w-24",
              )}
              aria-disabled="true"
            >
              Previous
            </span>
          )}

          <span className="text-center text-xs leading-relaxed tabular-nums text-muted-foreground sm:text-sm">
            Page {requestPage.page} ·{" "}
            {requestPage.items.length > 0
              ? `Showing ${rangeStart}–${rangeEnd}`
              : "No results"}
          </span>

          {requestPage.hasNext ? (
            <Link
              href={repairRequestInboxHref(status, requestPage.page + 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-11 min-w-20 sm:min-h-8 sm:min-w-24",
              )}
            >
              Next
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none min-h-11 min-w-20 opacity-50 sm:min-h-8 sm:min-w-24",
              )}
              aria-disabled="true"
            >
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
