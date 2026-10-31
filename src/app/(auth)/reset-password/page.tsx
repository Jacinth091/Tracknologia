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
import { getUser } from "@/features/auth";
import { ResetPasswordForm } from "../_components/reset-password-form";

export const metadata: Metadata = {
  title: "Set New Password — Tracknologia",
  description: "Enter your new Tracknologia password",
};

/** Query marker appended by the /auth/callback route after a recovery exchange. */
const RECOVERY_FLOW_VALUE = "recovery";

function RecoveryLinkRequiredCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <HugeiconsIcon
              icon={LockPasswordIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
          </span>
          Recovery link required
        </CardTitle>
        <CardDescription>
          This password recovery link is missing, expired, or has already been
          used.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed text-muted-foreground">
        <p>
          Each recovery email carries a single-use link. Open the newest
          recovery email in this browser and follow its link, or request a fresh
          one below. Recovery emails always go to your sign-in email — each
          person recovers their own account.
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

function PasswordFormCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <HugeiconsIcon
              icon={LockPasswordIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
          </span>
          Set New Password
        </CardTitle>
        <CardDescription>
          Enter and confirm your new secure password
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
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
  searchParams: Promise<{ flow?: string | string[] }>;
}) {
  const { flow } = await searchParams;
  // Only the scalar marker is trusted; repeated or lookup values fall back.
  const isRecoveryFlow = flow === RECOVERY_FLOW_VALUE;
  const user = await getUser();

  if (user && !isRecoveryFlow) {
    // An ordinary visit while signed in is not a recovery attempt: the reset
    // form only opens directly after the recovery email exchange.
    redirect("/dashboard");
  }

  if (!user) {
    // Missing, expired, reused, or not-yet-exchanged recovery credentials.
    return <RecoveryLinkRequiredCard />;
  }

  return <PasswordFormCard />;
}
