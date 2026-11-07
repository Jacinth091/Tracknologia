import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoginForm } from "../_components/login-form";
import { getSafeInternalRedirectUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign In — Tracknologia",
  description: "Sign in to your Tracknologia account",
};

const CALLBACK_ERROR_PARAM = "auth_callback_failed";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string | string[];
    error?: string | string[];
  }>;
}) {
  const { redirectTo, error } = await searchParams;
  // Only a scalar target is trusted; repeated/lookup values fall back.
  const safeRedirectTo = getSafeInternalRedirectUrl(
    typeof redirectTo === "string" ? redirectTo : undefined,
    "/dashboard",
  );
  // Only the deliberate callback-failure signal is rendered; every other
  // error value is ignored instead of echoed back.
  const callbackFailed = error === CALLBACK_ERROR_PARAM;

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle>
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        </CardTitle>
        <CardDescription>
          Enter the email and password for your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {callbackFailed && (
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
            <AlertTitle>That link could not be verified</AlertTitle>
            <AlertDescription>
              The link may have expired or already been used. Sign in below, or
              use &ldquo;Forgot password?&rdquo; to request a fresh link if you
              cannot remember your password.
            </AlertDescription>
          </Alert>
        )}
        <LoginForm redirectTo={safeRedirectTo} />
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-sm text-muted-foreground">
        <span>
          New here?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
          {" · "}
          <Link
            href="/privacy"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Privacy
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
