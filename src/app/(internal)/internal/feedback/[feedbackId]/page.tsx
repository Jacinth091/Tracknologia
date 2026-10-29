import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FeedbackError, getInternalFeedback } from "@/features/feedback";
import { cn } from "@/lib/utils";

import { InternalServiceUnavailable } from "../../_components/internal-service-unavailable";
import { FeedbackTriageForm } from "../_components/feedback-triage-form";

export const metadata: Metadata = {
  title: "Feedback Review — Tracknologia",
  description: "Internal operator review of a participant feedback submission",
};

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function DetailValue({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words whitespace-pre-wrap wrap-anywhere text-foreground">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

export default async function FeedbackDetailPage({
  params,
}: {
  params: Promise<{ feedbackId: string }>;
}) {
  const { feedbackId } = await params;

  let detail;
  try {
    detail = await getInternalFeedback(feedbackId);
  } catch (error) {
    if (error instanceof FeedbackError) {
      if (error.code === "FORBIDDEN" || error.code === "INVALID_INPUT") {
        notFound();
      }
    }
    return <InternalServiceUnavailable />;
  }

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {humanize(detail.original.category)} ·{" "}
            {humanize(detail.original.source)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Feedback review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted {formatTimestamp(detail.original.createdAt)}
          </p>
        </div>
        <Link
          href="/internal/feedback"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to inbox
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Participant submission (read-only)
          </CardTitle>
          <CardDescription>
            The participant&apos;s original wording. It is never edited or
            rewritten by operators.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <DetailValue label="Title" value={detail.original.title} />
            </div>
            <div className="sm:col-span-2">
              <DetailValue label="Message" value={detail.original.message} />
            </div>
            <DetailValue
              label="Participant class"
              value={humanize(detail.original.participantClass)}
            />
          </dl>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Triage</CardTitle>
          <CardDescription>
            Current state: {humanize(detail.review.status)} ·{" "}
            {humanize(detail.review.priority)} · version{" "}
            {detail.review.rowVersion}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackTriageForm
            feedbackId={detail.original.id}
            currentStatus={detail.review.status}
            currentPriority={detail.review.priority}
            currentInternalNotes={detail.review.internalNotes}
            currentLinkedIssueUrl={detail.review.linkedIssueUrl}
            rowVersion={detail.review.rowVersion}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status history</CardTitle>
          <CardDescription>
            Append-only operator events, oldest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.history.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No review events yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {detail.history.items.map((event) => (
                <li
                  key={event.eventId}
                  className="rounded-xl border border-border bg-muted/30 p-3 text-sm"
                >
                  <p className="font-medium text-foreground">
                    {humanize(event.fromStatus)} → {humanize(event.toStatus)}
                    {event.priorityBefore !== event.priorityAfter
                      ? ` · priority ${humanize(event.priorityBefore)} → ${humanize(event.priorityAfter)}`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatTimestamp(event.occurredAt)}
                    {event.reason ? ` · Reason: ${event.reason}` : ""}
                  </p>
                </li>
              ))}
              {detail.history.truncated ? (
                <li className="text-xs text-muted-foreground">
                  Older history beyond the {detail.history.items.length} shown
                  events stays protected and is not listed.
                </li>
              ) : null}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
