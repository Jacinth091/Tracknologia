import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Account Confirmed — Tracknologia",
  description: "Your Tracknologia provider account is confirmed and ready",
};

export default function ConfirmedPage() {
  return (
    <Card className="text-center border-primary/20 shadow-sm">
      <CardHeader className="pb-4">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <CardTitle className="text-2xl font-bold">Account Confirmed!</CardTitle>
        <CardDescription className="text-base text-muted-foreground mt-1">
          Your email has been verified successfully. Your provider account is active and ready.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          You can now start managing intake, generating tracking codes, and tracking repair workflows.
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          Open Provider Dashboard →
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
