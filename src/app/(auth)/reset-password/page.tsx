import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { LockPasswordIcon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getUser, hasRecoveryGrant, maskEmail } from "@/features/auth";
import { ResetPasswordForm } from "../_components/reset-password-form";

export const metadata: Metadata = {
  title: "Set New Password — Tracknologia",
  description: "Enter your new Tracknologia password",
};

function RecoveryCardIcon() {
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
      <HugeiconsIcon
        icon={LockPasswordIcon}
        strokeWidth={1.8}
        className="size-4"
        aria-hidden="true"
      />
    </span>
  );
}

function RecoveryLinkRequiredCard({ callbackFailed }: { callbackFailed: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <RecoveryCardIcon />
          <h1 className="font-semibold leading-tight tracking-tight">
            Recovery link required
          </h1>
        </CardTitle>
        <CardDescription>
          {callbackFailed
            ? "That link could not be verified. It may have expired or already been used."
            : "This password recovery link is missing, expired, or has already been used."}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed text-muted-foreground">
        <p>
          Each recovery email carries a single-use link. Open the newest
          recovery email in this browser and follow its link, or request a
          fresh one below. Recovery emails always go to your sign-in email —
          each person recovers their own account.
        </p>
      </CardContent>
      <CardFooter className="justify-center gap-3 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        <Link href="/forgot-password" className={buttonVariants()}>
          Request a new reset email
        </Link>
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

function PasswordFormCard({ recoveredEmail }: { recoveredEmail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <RecoveryCardIcon />
          <h1 className="font-semibold leading-tight tracking-tight">
            Set New Password
          </h1>
        </CardTitle>
        <CardDescription>
          Enter and confirm your new secure password
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* The recovery exchange decided which account is being recovered:
            show it so a recovered link never changes a password silently. */}
        <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Setting a new password for{" "}
          <span className="font-medium text-foreground">
            {recoveredEmail}
          </span>
        </p>
        <div className="mt-4">
          <ResetPasswordForm />
        </div>
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; callback_error?: string }>;
}) {
  const { flow, callback_error: callbackError } = await searchParams;

  const user = await getUser();

  if (user && flow !== "recovery" && !callbackError) {
    // An ordinary visit while signed in is not a recovery attempt: the reset
    // form only opens directly after the recovery email exchange.
    redirect("/dashboard");
  }

  if (!user) {
    // Missing, expired, reused, or not-yet-exchanged recovery credentials.
    return (
      <RecoveryLinkRequiredCard callbackFailed={Boolean(callbackError)} />
    );
  }

  if (callbackError) {
    // A failed callback while already signed in must be visible, not
    // silently swallowed by the sign-in redirect.
    return <RecoveryLinkRequiredCard callbackFailed />;
  }

  // Even a signed-in session with the `?flow=recovery` marker is not enough:
  // the form opens only for a server-issued, still-valid recovery grant.
  if (!(await hasRecoveryGrant(user.id))) {
    redirect("/dashboard");
  }

  return <PasswordFormCard recoveredEmail={maskEmail(user.email)} />;
}
