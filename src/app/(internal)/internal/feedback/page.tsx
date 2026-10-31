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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
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
  filters: {
    status?: string;
    category?: string;
    source?: string;
    due?: string;
  },
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
    timeZone: "Asia/Manila",
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
    due?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const dueForReview = nonEmptyParam(firstSearchParam(params.due)) === "1";
  const raw = {
    status: nonEmptyParam(firstSearchParam(params.status)),
    category: nonEmptyParam(firstSearchParam(params.category)),
    source: nonEmptyParam(firstSearchParam(params.source)),
    cursor: nonEmptyParam(firstSearchParam(params.cursor)),
    dueForReview: dueForReview || undefined,
  };
  const current = {
    status: raw.status,
    category: raw.category,
    source: raw.source,
    due: dueForReview ? "1" : undefined,
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
      <PageHeader
        eyebrow="Internal operations"
        title="Feedback Inbox"
        description="Review participant reports, suggestions, and privacy follow-ups."
      />

      <form
        method="get"
        action="/internal/feedback"
        aria-label="Feedback filters"
        className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="filter-status">Status</Label>
            <select
              id="filter-status"
              name="status"
              defaultValue={current.status ?? ""}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="filter-category">Category</Label>
            <select
              id="filter-category"
              name="category"
              defaultValue={current.category ?? ""}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="filter-source">Source</Label>
            <select
              id="filter-source"
              name="source"
              defaultValue={current.source ?? ""}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
            >
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <input
              id="filter-due"
              type="checkbox"
              name="due"
              value="1"
              defaultChecked={current.due === "1"}
              className="size-4 accent-foreground"
            />
            <Label htmlFor="filter-due">Due for review (90+ days)</Label>
          </div>
          <div className="flex gap-2">
            <Link
              href="/internal/feedback"
              className={buttonVariants({
                variant: "outline",
                className: "flex-1 sm:flex-none",
              })}
            >
              Clear filters
            </Link>
            <Button type="submit" className="flex-1 sm:flex-none">
              Apply filters
            </Button>
          </div>
        </div>
      </form>

      <section className="space-y-3" aria-labelledby="feedback-results-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="feedback-results-heading" className="text-lg font-semibold">
            {raw.cursor ? "Earlier submissions" : "Latest submissions"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {page.items.length} shown
          </p>
        </div>
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
                    className="group block px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-5"
                    aria-label={`Open feedback: ${item.title || humanize(item.category)}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-foreground">
                          {item.title || humanize(item.category)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                          <span>{humanize(item.category)}</span>
                          <span>{humanize(item.source)}</span>
                          <span>
                            {item.participantClass ===
                            "PUBLIC_SELF_REPORTED_CUSTOMER"
                              ? "Customer (self-reported)"
                              : humanize(item.participantClass)}
                          </span>
                          <time dateTime={item.createdAt}>
                            {formatSubmittedAt(item.createdAt)}
                          </time>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={
                            item.status === "NEW" ? "default" : "outline"
                          }
                          aria-label={`Status: ${humanize(item.status)}`}
                        >
                          {humanize(item.status)}
                        </Badge>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          aria-hidden="true"
                          className="size-4 text-muted-foreground group-hover:text-foreground"
                        />
                      </div>
                    </div>
                    {(item.mayContainContactDetails ||
                      item.priority !== "NORMAL") && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.mayContainContactDetails && (
                          <Badge variant="outline">
                            May contain personal details
                          </Badge>
                        )}
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
                      </div>
                    )}
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
      </section>
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Participant submissions only. Customer and Provider business records
        stay out of this area by design.
      </p>
    </div>
  );
}
