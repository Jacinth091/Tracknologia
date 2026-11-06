"use client";

import { useActionState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

import { updatePasswordAction } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePasswordAction,
    null,
  );

  return (
    <form action={formAction} aria-busy={isPending} className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            strokeWidth={1.8}
            className="size-4"
            aria-hidden="true"
          />
          <AlertTitle>Could not update the password</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">New Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          disabled={isPending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm New Password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat new password"
          disabled={isPending}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" />
            Updating password...
          </span>
        ) : (
          "Update Password & Go to Dashboard"
        )}
      </Button>
    </form>
  );
}
