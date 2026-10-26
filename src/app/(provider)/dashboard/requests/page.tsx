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

import { PageHeader } from "../_components/page-header";

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
        eyebrow="Customer intake"
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
                "relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
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
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5 sm:py-3.5"
                  >
                    <StatusGauge
                      status={request.status}
                      className="size-7 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-bold break-words text-foreground">
                        {device}
                        <span className="font-normal text-muted-foreground">
                          {" · "}
                          {request.reportedProblem}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {request.referenceCode} · {request.customerName} ·
                        Submitted {formatSubmittedAt(request.submittedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        data-status={request.status}
                        className="status-badge shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
                      >
                        {request.status.charAt(0) +
                          request.status.slice(1).toLowerCase()}
                      </span>
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </div>
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
          className="flex items-center justify-between gap-3"
          aria-label="Repair Request pagination"
        >
          {requestPage.hasPrevious ? (
            <Link
              href={repairRequestInboxHref(status, requestPage.page - 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-w-24",
              )}
            >
              Previous
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none min-w-24 opacity-50",
              )}
              aria-disabled="true"
            >
              Previous
            </span>
          )}

          <span className="text-sm tabular-nums text-muted-foreground">
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
                "min-w-24",
              )}
            >
              Next
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none min-w-24 opacity-50",
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
