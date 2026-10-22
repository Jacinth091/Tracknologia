"use client";

import { useActionState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

import { loginAction } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

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
              Authenticating credentials...
            </span>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {state?.error && !state.fieldErrors && (
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
            <AlertTitle>Could not sign in</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
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
          {state?.fieldErrors?.email && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={isPending}
            required
          />
          {state?.fieldErrors?.password && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.password}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Signing in...
            </span>
          ) : (
            "Sign in to Dashboard"
          )}
        </Button>
      </form>
    </div>
  );
}
