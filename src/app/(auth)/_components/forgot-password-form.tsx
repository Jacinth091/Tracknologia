"use client";

import { useActionState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { forgotPasswordAction } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    forgotPasswordAction,
    null,
  );

  return (
    <div className="relative">
      {isPending && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[1px] transition-all">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 shadow-md">
            <LoadingSpinner
              size="sm"
              className="border-current border-t-transparent text-foreground"
            />
            <span className="text-xs font-medium text-foreground">
              Sending reset link...
            </span>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {state?.error && (
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
            <AlertTitle>Could not send the reset link</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {state?.success && (
          <Alert>
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={1.8}
              className="size-4 text-primary"
              aria-hidden="true"
            />
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@provider.com"
            disabled={isPending}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Sending reset link...
            </span>
          ) : (
            "Send Reset Link"
          )}
        </Button>
      </form>
    </div>
  );
}
