"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackFormState,
} from "../types";

// Labels and the Bug prompt are the #81 contract; the other prompts and all
// participant copy below are the #87 §3.1/§3.6 proposal (owner approval
// pending). Prompts are guidance only; one message field holds the text.
const CATEGORY_COPY: Record<
  FeedbackCategory,
  { label: string; prompt: string }
> = {
  BUG: {
    label: "Bug Report",
    prompt:
      "What were you trying to do? / What happened? / What did you expect?",
  },
  USABILITY: {
    label: "Usability",
    prompt:
      "What were you trying to do, and what made it harder than expected?",
  },
  FEATURE_REQUEST: {
    label: "Feature Request",
    prompt: "What would you like to be able to do, and why?",
  },
  GENERAL: {
    label: "General",
    prompt: "What would you like us to know?",
  },
};

const SUCCESS_COPY =
  "Thanks — your feedback was received. We can't reply to every submission.";
const UNCONFIRMED_COPY =
  "We couldn't confirm that your feedback reached us. Retrying is safe and reuses the same submission identifier.";

type FeedbackFormAction = (
  state: FeedbackFormState | null,
  formData: FormData,
) => Promise<FeedbackFormState>;
type Rejected = Extract<FeedbackFormState, { status: "rejected" }>;

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function isCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

/**
 * The one participant feedback form for public and Provider routes. The route
 * supplies its Server Action and a server-generated nonce; the nonce survives
 * every rejection and lost response, and is replaced only after acceptance.
 */
export function FeedbackForm({
  action,
  initialNonce,
}: {
  action: FeedbackFormAction;
  initialNonce: string;
}) {
  const [state, formAction, pending] = useActionState<
    FeedbackFormState | null,
    FormData
  >(async (previous, formData) => {
    try {
      return await action(previous, formData);
    } catch {
      // The response was lost, possibly after the row committed. Keeping the
      // nonce makes the retry a no-op if it did.
      return {
        status: "rejected",
        reason: "UNAVAILABLE",
        message: UNCONFIRMED_COPY,
        fieldErrors: {},
        values: {
          category: formText(formData, "category"),
          title: formText(formData, "title"),
          message: formText(formData, "message"),
        },
        nonce: formText(formData, "submissionNonce"),
      };
    }
  }, null);
  const [startedNonce, setStartedNonce] = useState<string | null>(null);

  if (state?.status === "accepted" && startedNonce !== state.nextNonce) {
    return (
      <Card>
        <CardContent className="space-y-4">
          <p role="status" className="text-base font-semibold text-foreground">
            {SUCCESS_COPY}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStartedNonce(state.nextNonce)}
          >
            Send more feedback
          </Button>
        </CardContent>
      </Card>
    );
  }

  const rejected = state?.status === "rejected" ? state : null;
  const nonce =
    state?.status === "accepted"
      ? state.nextNonce
      : (rejected?.nonce ?? initialNonce);

  return (
    <FeedbackFields
      // A new nonce means a new submission: remount so the fields start blank.
      key={nonce}
      formAction={formAction}
      pending={pending}
      nonce={nonce}
      rejected={rejected}
    />
  );
}

function FeedbackFields({
  formAction,
  pending,
  nonce,
  rejected,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  nonce: string;
  rejected: Rejected | null;
}) {
  const values = rejected?.values;
  const fieldErrors = rejected?.fieldErrors ?? {};
  const [category, setCategory] = useState(values?.category ?? "");
  const prompt = isCategory(category) ? CATEGORY_COPY[category].prompt : null;
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <form action={formAction} className="space-y-6" aria-busy={pending}>
      {rejected && !hasFieldErrors && (
        <Alert variant="destructive" role="alert">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" />
          <AlertDescription>{rejected.message}</AlertDescription>
        </Alert>
      )}

      <input type="hidden" name="submissionNonce" value={nonce} />

      <fieldset
        className="space-y-3"
        aria-describedby={
          fieldErrors.category ? "feedback-category-error" : undefined
        }
      >
        <legend className="text-sm font-medium text-foreground">
          What kind of feedback?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEEDBACK_CATEGORIES.map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors has-checked:border-foreground has-checked:bg-secondary has-focus-visible:ring-[3px] has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name="category"
                value={value}
                defaultChecked={values?.category === value}
                onChange={() => setCategory(value)}
                required
                className="size-4 accent-foreground"
              />
              {CATEGORY_COPY[value].label}
            </label>
          ))}
        </div>
        {fieldErrors.category && (
          <p id="feedback-category-error" className="text-xs text-destructive">
            {fieldErrors.category}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="feedback-title">Title (optional)</Label>
        <Input
          id="feedback-title"
          name="title"
          defaultValue={values?.title}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={
            fieldErrors.title ? "feedback-title-error" : undefined
          }
        />
        {fieldErrors.title && (
          <p id="feedback-title-error" className="text-xs text-destructive">
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">Message</Label>
        {prompt && (
          <p
            id="feedback-message-prompt"
            className="text-sm text-muted-foreground"
          >
            {prompt}
          </p>
        )}
        <Textarea
          id="feedback-message"
          name="message"
          rows={6}
          defaultValue={values?.message}
          required
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={
            [
              prompt ? "feedback-message-prompt" : null,
              fieldErrors.message ? "feedback-message-error" : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {fieldErrors.message && (
          <p id="feedback-message-error" className="text-xs text-destructive">
            {fieldErrors.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full sm:w-auto"
      >
        {pending ? (
          <>
            <LoadingSpinner className="size-4" />
            <span>Sending...</span>
          </>
        ) : (
          "Send feedback"
        )}
      </Button>

      <FeedbackPrivacyNotice />
    </form>
  );
}

// #87 §4.0 PROPOSED notice. It must not be published before owner approval,
// the 90-day deletion actually running, and confirmed backup retention.
function FeedbackPrivacyNotice() {
  return (
    <details className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">
        How we handle your feedback
      </summary>
      <div className="mt-3 space-y-3 leading-relaxed">
        <p>
          When you send feedback, we collect the category, any title you add,
          your message, the part of the service you sent it from, whether you
          are an anonymous customer or an authenticated Provider (and, for
          Providers, the existing Provider role derived from your session), and
          the time of submission. Customers can submit without an account.
          Providers use their existing account and Provider context. We do not
          ask for your name, email address, phone number, Tracking Code, Request
          Reference or photos. Please do not include personal details. Your
          message is free text and may contain personal data even when you do
          not intend it to.
        </p>
        <p>
          Only designated internal operators can read feedback. Providers and
          the public cannot see it. We use a short-lived opaque key, not your
          raw IP address, to prevent abuse. Reporting uses aggregate counts
          only.
        </p>
        <p>
          We delete the entire feedback submission, including its text and
          metadata, 90 days after submission. We keep a separate minimal review,
          access and deletion audit for 180 days. Backup expiry depends on the
          deployment provider and is not yet confirmed; we cannot promise
          immediate erasure from backups. We do not promise a response or a
          service level.
        </p>
      </div>
    </details>
  );
}
