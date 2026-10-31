import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Search01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";

import { StatusGauge } from "@/components/shared/status-gauge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  listRepairs,
  repairListOptionsSchema,
  repairListStatusEnum,
  repairPageSchema,
  type RepairListStatus,
} from "@/features/repairs";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/shared/page-header";
import { RepairStatusPill } from "../_components/repair-status-badge";

export const metadata: Metadata = {
  title: "Repairs — Tracknologia",
  description: "Manage active and completed Repairs",
};

const PAGE_SIZE = 25;

const FILTERS: Array<{ label: string; status?: RepairListStatus }> = [
  { label: "All" },
  { label: "In Progress", status: "IN_PROGRESS" },
  { label: "Waiting", status: "WAITING" },
  { label: "Waiting for Parts", status: "WAITING_FOR_PARTS" },
  { label: "Awaiting Approval", status: "AWAITING_APPROVAL" },
  { label: "Ready", status: "READY" },
  { label: "Completed", status: "COMPLETED" },
];

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function repairListHref({
  status,
  query,
  page = 1,
}: {
  status?: RepairListStatus;
  query?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/dashboard/repairs${search ? `?${search}` : ""}`;
}

function formatUpdatedAt(value: string) {
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

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const statusResult = repairListStatusEnum.safeParse(
    firstSearchParam(params.status),
  );
  const status = statusResult.success ? statusResult.data : undefined;
  const pageResult = repairPageSchema.safeParse(firstSearchParam(params.page));
  const page = pageResult.success ? pageResult.data : 1;
  const queryCandidate = firstSearchParam(params.q)?.trim() || undefined;
  const optionsResult = repairListOptionsSchema.safeParse({
    status,
    query: queryCandidate,
    page,
  });
  const searchError = optionsResult.success
    ? undefined
    : optionsResult.error.issues.find((issue) => issue.path[0] === "query")
        ?.message;
  const options = optionsResult.success
    ? optionsResult.data
    : { status, page: 1, query: undefined };
  const repairPage = await listRepairs(options);
  const rangeStart = (repairPage.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = rangeStart + repairPage.items.length - 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repairs"
        description="Manage accepted work from intake through completion."
        actions={
          <Link
            href="/dashboard/repairs/new"
            className={cn(buttonVariants(), "w-full sm:w-fit")}
          >
            Create Repair
          </Link>
        }
      />

      <form
        method="get"
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start"
      >
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="relative min-w-0 flex-1 space-y-1.5">
          <HugeiconsIcon
            icon={Search01Icon}
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground sm:top-2.5"
          />
          <Input
            type="search"
            name="q"
            defaultValue={queryCandidate ?? ""}
            placeholder="Search ticket, customer, or device"
            maxLength={80}
            aria-label="Search Repairs"
            aria-invalid={Boolean(searchError)}
            aria-describedby={searchError ? "repair-search-error" : undefined}
            className="pl-9"
          />
          {searchError ? (
            <p
              id="repair-search-error"
              className="text-xs text-destructive"
              role="alert"
            >
              {searchError}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Search
          </Button>
          {queryCandidate ? (
            <Link
              href={repairListHref({ status })}
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <nav
        aria-label="Repair status filters"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        {FILTERS.map((filter) => {
          const active =
            filter.status === status || (!filter.status && !status);
          return (
            <Link
              key={filter.label}
              aria-current={active ? "page" : undefined}
              href={repairListHref({
                status: filter.status,
                query: options.query,
              })}
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

      {repairPage.items.length === 0 ? (
        <Empty className="rounded-xl border border-border bg-card p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Wrench01Icon} aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No matching Repairs</EmptyTitle>
            <EmptyDescription>
              Create a direct Repair or accept a customer Repair Request.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/dashboard/repairs/new" className={buttonVariants()}>
              Create Repair
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {repairPage.items.map((repair) => {
              const device = deviceLabel(
                repair.deviceType,
                repair.brand,
                repair.model,
              );
              return (
                <li key={repair.id}>
                  <Link
                    href={`/dashboard/repairs/${repair.id}`}
                    aria-label={`Open Repair: ${device}`}
                    className="flex items-start gap-3 px-4 py-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                  >
                    <StatusGauge
                      status={repair.currentStatus}
                      className="mt-0.5 size-7 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 basis-40 line-clamp-2 text-sm font-semibold leading-snug text-foreground wrap-anywhere">
                          {device}
                        </p>
                        <RepairStatusPill status={repair.currentStatus} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground wrap-anywhere">
                        {repair.reportedProblem}
                      </p>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-mono wrap-anywhere">
                          {repair.ticketNumber}
                        </span>
                        <span className="wrap-anywhere">
                          {repair.customerName}
                        </span>
                        <time
                          dateTime={repair.updatedAt}
                          className="tabular-nums"
                        >
                          Updated {formatUpdatedAt(repair.updatedAt)}
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

      {repairPage.items.length > 0 ||
      repairPage.hasPrevious ||
      repairPage.hasNext ? (
        <nav
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
          aria-label="Repair pagination"
        >
          {repairPage.hasPrevious ? (
            <Link
              href={repairListHref({
                status,
                query: options.query,
                page: repairPage.page - 1,
              })}
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
            Page {repairPage.page} ·{" "}
            {repairPage.items.length > 0
              ? `Showing ${rangeStart}–${rangeEnd}`
              : "No results"}
          </span>
          {repairPage.hasNext ? (
            <Link
              href={repairListHref({
                status,
                query: options.query,
                page: repairPage.page + 1,
              })}
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
