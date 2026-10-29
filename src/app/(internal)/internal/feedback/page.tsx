import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Message01Icon } from "@hugeicons/core-free-icons";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { listInternalFeedback, FeedbackError } from "@/features/feedback";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
} from "@/features/feedback/types";
import { InternalServiceUnavailable } from "../_components/internal-service-unavailable";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Feedback Inbox — Tracknologia",
  description: "Internal operator triage of participant feedback",
};

// Zod narrows each enum into a literal union; the runtime arrays are used here
// only to build the filter options.
const STATUS_OPTIONS = [
  ...FEEDBACK_STATUSES.map((value) => ({ value, label: humanize(value) })),
];
const CATEGORY_OPTIONS = [
  ...FEEDBACK_CATEGORIES.map((value) => ({ value, label: humanize(value) })),
];
const SOURCE_OPTIONS = [
  ...FEEDBACK_SOURCES.map((value) => ({ value, label: humanize(value) })),
];

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function nonEmptyParam(value?: string) {
  return value && value.length > 0 ? value : undefined;
}

function inboxHref(
  filters: { status?: string; category?: string; source?: string },
  cursor?: string,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  const query = params.toString();
  return `/internal/feedback${query ? `?${query}` : ""}`;
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const PRIORITY_BADGE: Record<string, string> = {
  HIGH: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  CRITICAL: "border-destructive/50 text-destructive",
};

export default async function FeedbackInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    category?: string | string[];
    source?: string | string[];
    cursor?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const raw = {
    status: nonEmptyParam(firstSearchParam(params.status)),
    category: nonEmptyParam(firstSearchParam(params.category)),
    source: nonEmptyParam(firstSearchParam(params.source)),
    cursor: nonEmptyParam(firstSearchParam(params.cursor)),
  };
  const current = {
    status: raw.status,
    category: raw.category,
    source: raw.source,
  };

  let page;
  try {
    page = await listInternalFeedback(raw);
  } catch (error) {
    if (error instanceof FeedbackError) {
      if (error.code === "FORBIDDEN") {
        notFound();
      }
      if (error.code === "INVALID_INPUT") {
        notFound();
      }
    }
    return <InternalServiceUnavailable />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Operator triage
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Feedback Inbox
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Participant submissions only. Customer and Provider business records
          stay out of this area by design.
        </p>
      </div>

      <form
        method="get"
        action="/internal/feedback"
        aria-label="Feedback filters"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <select
            id="filter-status"
            name="status"
            defaultValue={current.status ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-category">Category</Label>
          <select
            id="filter-category"
            name="category"
            defaultValue={current.category ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-source">Source</Label>
          <select
            id="filter-source"
            name="source"
            defaultValue={current.source ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Apply filters
          </button>
        </div>
      </form>

      {page.items.length === 0 ? (
        <Empty className="rounded-xl border border-border bg-card p-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Message01Icon} aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No matching feedback</EmptyTitle>
            <EmptyDescription>
              New participant submissions appear here for operator review.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {page.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/internal/feedback/${item.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5 sm:py-3.5"
                  aria-label={`Open feedback: ${item.title || humanize(item.category)}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">
                      {item.title || humanize(item.category)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {humanize(item.category)} · {humanize(item.source)} ·{" "}
                      {humanize(item.participantClass)} ·{" "}
                      {formatSubmittedAt(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.priority !== "NORMAL" && (
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          PRIORITY_BADGE[item.priority],
                        )}
                      >
                        {humanize(item.priority)}
                      </span>
                    )}
                    <span
                      className="status-badge shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold"
                      aria-label={`Status: ${humanize(item.status)}`}
                    >
                      {humanize(item.status)}
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {page.nextCursor ? (
        <div className="flex justify-end">
          <Link
            href={inboxHref(current, page.nextCursor)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Older submissions
          </Link>
        </div>
      ) : null}
    </div>
  );
}
