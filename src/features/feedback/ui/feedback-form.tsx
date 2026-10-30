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

import { looksLikeContactDetails } from "../contact-details";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackFormState,
} from "../types";

// Category labels and prompts, and all participant copy below, were
// owner-approved on 2026-10-30 (#87). Prompts are guidance only; one message
// field holds the text.
const CATEGORY_COPY: Record<
  FeedbackCategory,
  { label: string; prompt: string }
> = {
  BUG: {
    label: "Bug Report",
    prompt:
      "Something not working? Tell us what you were doing and what went wrong.",
  },
  USABILITY: {
    label: "Usability",
    prompt: "Was something confusing or hard to use?",
  },
  FEATURE_REQUEST: {
    label: "Feature Request",
    prompt: "What would make Tracknologia more useful for you?",
  },
  GENERAL: {
    label: "General",
    prompt: "Anything else you'd like to tell us?",
  },
};

const SUCCESS_COPY =
  "Thanks! We got your feedback. We read everything, but we can't reply to each message.";
const UNCONFIRMED_COPY =
  "We're not sure it went through. It's safe to send again; we won't get it twice.";

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

function isEditedSince(previous: Rejected, formData: FormData): boolean {
  return (["category", "title", "message"] as const).some(
    (name) => formText(formData, name) !== previous.values[name],
  );
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
    // A changed text is a new submission. Only an identical resend keeps the
    // nonce, so an edited retry is never stored as the old text.
    if (previous?.status === "rejected" && isEditedSince(previous, formData)) {
      formData.set("submissionNonce", crypto.randomUUID());
    }
    const sentNonce = formText(formData, "submissionNonce");
    try {
      return await action(previous, formData);
    } catch {
      // The response was lost, possibly after the row committed. Keeping the
      // sent nonce makes an identical retry a no-op if it did.
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
        nonce: sentNonce,
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
  const [typed, setTyped] = useState({
    title: values?.title ?? "",
    message: values?.message ?? "",
  });
  const contactWarning = looksLikeContactDetails(
    `${typed.title}\n${typed.message}`,
  );

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
          <p
            id="feedback-category-error"
            role="alert"
            className="text-xs text-destructive"
          >
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
          onChange={(event) =>
            setTyped((current) => ({ ...current, title: event.target.value }))
          }
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={
            fieldErrors.title ? "feedback-title-error" : undefined
          }
        />
        {fieldErrors.title && (
          <p
            id="feedback-title-error"
            role="alert"
            className="text-xs text-destructive"
          >
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">Message</Label>
        <p
          id="feedback-message-reminder"
          className="text-sm text-muted-foreground"
        >
          Please don&apos;t include names, phone numbers, addresses or other
          personal details.
        </p>
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
          onChange={(event) =>
            setTyped((current) => ({
              ...current,
              message: event.target.value,
            }))
          }
          required
          aria-invalid={Boolean(fieldErrors.message)}
          aria-describedby={[
            "feedback-message-reminder",
            prompt ? "feedback-message-prompt" : null,
            contactWarning ? "feedback-contact-warning" : null,
            fieldErrors.message ? "feedback-message-error" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <p
          id="feedback-contact-warning"
          aria-live="polite"
          className="text-sm text-destructive"
        >
          {contactWarning &&
            "This looks like a phone number or email address. Please remove it before sending."}
        </p>
        {fieldErrors.message && (
          <p
            id="feedback-message-error"
            role="alert"
            className="text-xs text-destructive"
          >
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

// Owner-approved on 2026-10-30 (#87 decision 8). Changing this text needs a new
// owner decision.
function FeedbackPrivacyNotice() {
  return (
    <details className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">
        How we handle your feedback
      </summary>
      <div className="mt-3 space-y-3 leading-relaxed">
        <p>
          <strong>What we collect:</strong> the kind of feedback, your title and
          message, which page you sent it from, whether you&apos;re a customer
          or a Provider (and your Provider role), and when you sent it. We
          don&apos;t ask for your name, email, phone number or tracking codes.
          Please don&apos;t put them in your message.
        </p>
        <p>
          <strong>Who can read it:</strong> only the Tracknologia team. Other
          customers and Providers can&apos;t.
        </p>
        <p>
          <strong>How long we keep it:</strong> within 90 days we review
          feedback and remove any personal details we find, or delete it if it
          isn&apos;t useful. After that we keep it to help improve Tracknologia.
          Removed details may stay in backups for a limited time. We use a
          temporary coded key, not your IP address, to stop spam. We can&apos;t
          reply to every message.
        </p>
      </div>
    </details>
  );
}
