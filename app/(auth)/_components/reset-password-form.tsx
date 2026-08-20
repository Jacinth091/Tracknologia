"use client";

import { useActionState } from "react";
import { updatePasswordAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePasswordAction, null);

  return (
    <div className="relative">
      {/* Loading Overlay Placeholder */}
      {isPending && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-background/60 backdrop-blur-[1px] transition-all">
          <div className="flex items-center gap-2 rounded-xl bg-card border border-border/80 px-4 py-2 shadow-md">
            <LoadingSpinner size="sm" className="text-primary border-primary border-t-transparent" />
            <span className="text-xs font-medium text-foreground">
              Updating your password...
            </span>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {state?.error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive font-medium">
            {state.error}
          </div>
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
    </div>
  );
}
