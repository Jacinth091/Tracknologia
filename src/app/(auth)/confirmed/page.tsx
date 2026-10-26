import type { Metadata } from "next";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Email Confirmed — Tracknologia",
  description: "Your email has been verified on Tracknologia",
};

export default function ConfirmedPage() {
  return (
    <Card className="border-primary/20 text-center shadow-sm">
      <CardHeader className="pb-4">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-foreground">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={1.8}
            className="size-7"
            aria-hidden="true"
          />
        </div>
        <CardTitle className="text-2xl font-bold">Email Confirmed!</CardTitle>
        <CardDescription className="mt-1 text-base text-muted-foreground">
          Your email has been verified successfully.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Continue to finish configuring your provider profile or join your
          repair shop team.
        </p>
        <Link
          href="/onboarding"
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          Continue to Onboarding &amp; Dashboard →
        </Link>
      </CardContent>
      <CardFooter className="justify-center border-t border-border/50 pt-4 text-xs text-muted-foreground">
        Need to switch accounts?{" "}
        <Link
          href="/login"
          className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
