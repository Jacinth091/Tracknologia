import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FeedbackError, getInternalFeedback } from "@/features/feedback";
import { looksLikeContactDetails } from "@/features/feedback/contact-details";
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Feedback inbox"
        title="Feedback review"
        description={
          <p>
            Submitted{" "}
            <time dateTime={detail.original.createdAt}>
              {formatTimestamp(detail.original.createdAt)}
            </time>
          </p>
        }
        actions={
          <Link
            href="/internal/feedback"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to inbox
          </Link>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg">Participant submission</h2>
            </CardTitle>
            <CardDescription>
              Read-only. The participant&apos;s original wording is never edited
              or rewritten by operators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {humanize(detail.original.category)}
              </Badge>
              <Badge variant="outline">
                {humanize(detail.original.source)}
              </Badge>
            </div>
            {looksLikeContactDetails(
              `${detail.original.title ?? ""} ${detail.original.message}`,
            ) ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Badge variant="outline">May contain personal details</Badge>
                <p className="text-sm text-muted-foreground">
                  Before closing, redact personal details with the feedback
                  redaction runbook in docs/OPERATIONS.md.
                </p>
              </div>
            ) : null}
            <dl className="space-y-6 [&_dd]:text-base [&_dd]:leading-relaxed">
              <DetailValue label="Title" value={detail.original.title} />
              <DetailValue label="Message" value={detail.original.message} />
              <DetailValue
                label="Participant class"
                value={humanize(detail.original.participantClass)}
              />
            </dl>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2 className="text-lg">Review &amp; triage</h2>
            </CardTitle>
            <CardDescription>
              Set the next status and keep follow-up notes for operators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
              <span className="text-xs text-muted-foreground">Current</span>
              <Badge
                variant={
                  detail.review.status === "NEW" ? "default" : "secondary"
                }
              >
                {humanize(detail.review.status)}
              </Badge>
              <Badge variant="outline">
                {humanize(detail.review.priority)} priority
              </Badge>
            </div>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg">Status history</h2>
          </CardTitle>
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
            <ol className="divide-y divide-border">
              {detail.history.items.map((event) => (
                <li
                  key={event.eventId}
                  className="py-4 text-sm first:pt-0 last:pb-0"
                >
                  <p className="font-medium text-foreground">
                    {humanize(event.fromStatus)} → {humanize(event.toStatus)}
                    {event.priorityBefore !== event.priorityAfter
                      ? ` · priority ${humanize(event.priorityBefore)} → ${humanize(event.priorityAfter)}`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <time dateTime={event.occurredAt}>
                      {formatTimestamp(event.occurredAt)}
                    </time>
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
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
