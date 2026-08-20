"use client";

import { useActionState } from "react";
import { registerAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && !state.fieldErrors && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary font-medium">
          {state.success}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          disabled={isPending}
          required
        />
        {state?.fieldErrors?.email && (
          <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          disabled={isPending}
          required
        />
        {state?.fieldErrors?.password && (
          <p className="text-xs text-destructive">{state.fieldErrors.password}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repeat password"
          disabled={isPending}
          required
        />
        {state?.fieldErrors?.confirmPassword && (
          <p className="text-xs text-destructive">{state.fieldErrors.confirmPassword}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner size="sm" />
            Creating account...
          </span>
        ) : (
          "Create Account"
        )}
      </Button>

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        After signing up, you will choose your provider operating model or accept a staff invite.
      </p>
    </form>
  );
}
