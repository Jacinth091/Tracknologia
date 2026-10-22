"use client";

import { useActionState, useState } from "react";
import { registerAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

interface RegisterFormProps {
  initialInvite?: string;
}

export function RegisterForm({ initialInvite }: RegisterFormProps) {
  const [intent, setIntent] = useState<"INDEPENDENT" | "SHOP" | "STAFF">(
    initialInvite ? "STAFF" : "INDEPENDENT",
  );
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className="space-y-6">
      {/* Step 1: Select Intent / Role */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          What are you signing up as?
        </Label>
        <div
          role="radiogroup"
          aria-label="Account Role"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {(
            [
              {
                value: "INDEPENDENT",
                label: "Independent",
                description: "Solo technician or mobile repairer.",
              },
              {
                value: "SHOP",
                label: "Shop Owner",
                description: "Storefront or workshop repair business.",
              },
              {
                value: "STAFF",
                label: "Shop Staff",
                description: "Joining a shop with an invitation.",
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                intent === option.value
                  ? "border-ring bg-accent ring-1 ring-ring"
                  : "border-input bg-card hover:bg-muted/40",
                isPending && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="account-intent"
                value={option.value}
                checked={intent === option.value}
                disabled={isPending}
                onChange={() => setIntent(option.value)}
                className="mt-1 size-4 shrink-0 accent-ring"
              />
              <span>
                <span className="block text-sm font-semibold">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Step 2: Account Creation Form */}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="intent" value={intent} />

        {state?.error && !state.fieldErrors && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {state.error}
          </div>
        )}

        {state?.success && (
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-foreground font-medium">
            {state.success}
          </div>
        )}

        {/* Staff-Specific Invitation Code Field */}
        {intent === "STAFF" && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="space-y-1">
              <Label
                htmlFor="inviteToken"
                className="text-xs font-semibold text-foreground"
              >
                Shop Invitation Code *
              </Label>
              <Input
                id="inviteToken"
                name="inviteToken"
                defaultValue={initialInvite ?? ""}
                placeholder="Paste the invitation token from your Shop Owner"
                disabled={isPending}
                required
                className="bg-background"
              />
              {state?.fieldErrors?.inviteToken && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.inviteToken}
                </p>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Don&apos;t have an invite code? Ask your Shop Owner to generate an
              invite from their dashboard.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={
              intent === "SHOP"
                ? "owner@repairshop.com"
                : intent === "STAFF"
                  ? "staff@repairshop.com"
                  : "alex@mobiletech.com"
            }
            disabled={isPending}
            required
          />
          {state?.fieldErrors?.email && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              disabled={isPending}
              required
            />
            {state?.fieldErrors?.password && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.password}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password *</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat password"
              disabled={isPending}
              required
            />
            {state?.fieldErrors?.confirmPassword && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.confirmPassword}
              </p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" />
              Creating account...
            </span>
          ) : intent === "STAFF" ? (
            "Verify Invite & Create Staff Account"
          ) : (
            "Create Account & Continue"
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center pt-1">
          {intent === "STAFF"
            ? "Your staff account will be linked to your shop upon registration."
            : "Next step: configure your provider details in onboarding."}
        </p>
      </form>
    </div>
  );
}
