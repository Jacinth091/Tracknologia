import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Login03Icon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "../_components/login-form";
import { getSafeInternalRedirectUrl } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sign In — Tracknologia",
  description: "Sign in to your Tracknologia account",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;
  // Only a scalar target is trusted; repeated/lookup values fall back.
  const safeRedirectTo = getSafeInternalRedirectUrl(
    typeof redirectTo === "string" ? redirectTo : undefined,
    "/dashboard",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <HugeiconsIcon
              icon={Login03Icon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
          </span>
          Welcome back
        </CardTitle>
        <CardDescription>
          Sign in with your email and password to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm redirectTo={safeRedirectTo} />
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Register as a Provider
        </Link>
      </CardFooter>
    </Card>
  );
}
