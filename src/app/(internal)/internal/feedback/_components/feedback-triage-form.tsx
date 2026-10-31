"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
} from "@/features/feedback/types";

import { recordFeedbackReviewAction } from "../actions";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Keep as New",
  REVIEWING: "Reviewing",
  PLANNED: "Planned",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  HIGH: "High",
  CRITICAL: "Critical",
};

interface FeedbackTriageFormProps {
  feedbackId: string;
  currentStatus: string;
  currentPriority: string;
  currentInternalNotes?: string | null;
  currentLinkedIssueUrl?: string | null;
  rowVersion: number;
}

export function FeedbackTriageForm({
  feedbackId,
  currentStatus,
  currentPriority,
  currentInternalNotes,
  currentLinkedIssueUrl,
  rowVersion,
}: FeedbackTriageFormProps) {
  const [state, formAction, pending] = useActionState(
    recordFeedbackReviewAction,
    null,
  );
  const latestVersion = state?.appliedRowVersion ?? rowVersion;
  const reopening =
    currentStatus === "RESOLVED" || currentStatus === "DISMISSED";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="feedbackId" value={feedbackId} />
      <input type="hidden" name="expectedRowVersion" value={latestVersion} />

      {state?.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.success && (
        <Alert role="status">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="triage-status">Status</Label>
          <select
            id="triage-status"
            name="status"
            defaultValue={currentStatus}
            disabled={pending}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
          >
            {FEEDBACK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="triage-priority">Priority</Label>
          <select
            id="triage-priority"
            name="priority"
            defaultValue={currentPriority}
            disabled={pending}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
          >
            {FEEDBACK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="triage-notes">Internal notes</Label>
        <p id="triage-notes-help" className="text-xs text-muted-foreground">
          Leave empty to clear the stored notes.
        </p>
        <Textarea
          id="triage-notes"
          name="internalNotes"
          aria-describedby="triage-notes-help"
          className="min-h-32"
          defaultValue={currentInternalNotes ?? ""}
          maxLength={2000}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="triage-issue-url">Linked GitHub issue</Label>
        <p id="triage-issue-help" className="text-xs text-muted-foreground">
          Optional GitHub issue link for this repository. Nothing is posted
          automatically.
        </p>
        <Input
          id="triage-issue-url"
          name="linkedIssueUrl"
          type="url"
          aria-describedby="triage-issue-help"
          defaultValue={currentLinkedIssueUrl ?? ""}
          disabled={pending}
        />
      </div>

      {reopening ? (
        <div className="space-y-2">
          <Label htmlFor="triage-reason">Reopen reason</Label>
          <p id="triage-reason-help" className="text-xs text-muted-foreground">
            Required when moving a resolved or dismissed item back to Reviewing.
          </p>
          <Input
            id="triage-reason"
            name="reason"
            aria-describedby="triage-reason-help"
            maxLength={500}
            disabled={pending}
          />
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" /> Saving review...
            </span>
          ) : (
            "Save review"
          )}
        </Button>
      </div>
    </form>
  );
}
