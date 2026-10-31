import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "../_components/register-form";

export const metadata: Metadata = {
  title: "Get Started — Tracknologia",
  description:
    "Create your Tracknologia account as an Independent repairer, Shop Owner, or Shop Staff",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="space-y-1 pb-4 text-center">
        <CardTitle className="flex items-center justify-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <HugeiconsIcon
              icon={UserAdd01Icon}
              strokeWidth={1.8}
              className="size-4.5"
              aria-hidden="true"
            />
          </span>
          Get Started with Tracknologia
        </CardTitle>
        <CardDescription className="text-sm">
          Select what you are signing up as to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm initialInvite={invite} />
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </CardFooter>
      <p className="pb-6 text-center text-xs text-muted-foreground">
        <Link
          href="/privacy"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Privacy notice
        </Link>
      </p>
    </Card>
  );
}
