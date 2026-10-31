import type { Metadata } from "next";
import Link from "next/link";
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
      <CardHeader className="space-y-1 text-center">
        <CardTitle>
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        </CardTitle>
        <CardDescription>
          Enter the email and password for your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
