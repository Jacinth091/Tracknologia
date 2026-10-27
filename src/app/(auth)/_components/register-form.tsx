"use client";

import { useActionState, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Store01Icon,
  Ticket01Icon,
  UserGroupIcon,
  UserIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";

import { registerAction } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

interface RegisterFormProps {
  initialInvite?: string;
}

const INTENT_OPTIONS = [
  {
    value: "INDEPENDENT",
    label: "Independent",
    description: "Solo technician or mobile repairer.",
    icon: Wrench01Icon,
  },
  {
    value: "SHOP",
    label: "Shop Owner",
    description: "Storefront or workshop repair business.",
    icon: Store01Icon,
  },
  {
    value: "STAFF",
    label: "Shop Staff",
    description: "Joining a shop with an invitation.",
    icon: UserGroupIcon,
  },
] as const;

export function RegisterForm({ initialInvite }: RegisterFormProps) {
  const [intent, setIntent] = useState<"INDEPENDENT" | "SHOP" | "STAFF">(
    initialInvite ? "STAFF" : "INDEPENDENT",
  );
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={UserIcon}
            strokeWidth={1.8}
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Label className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            What are you signing up as?
          </Label>
        </div>
        <div
          role="radiogroup"
          aria-label="Account Role"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {INTENT_OPTIONS.map((option) => {
            const selected = intent === option.value;

            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-3 rounded-lg border p-3.5 transition-colors",
                  selected
                    ? "border-foreground bg-muted/60 ring-1 ring-foreground"
                    : "border-input bg-card hover:border-foreground/40 hover:bg-muted/30",
                  isPending && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-md border",
                      selected
                        ? "border-foreground/20 bg-background text-foreground"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <HugeiconsIcon
                      icon={option.icon}
                      strokeWidth={1.8}
                      className="size-4"
                      aria-hidden="true"
                    />
                  </span>
                  <input
                    type="radio"
                    name="account-intent"
                    value={option.value}
                    checked={selected}
                    disabled={isPending}
                    onChange={() => setIntent(option.value)}
                    className="size-4 shrink-0 accent-foreground"
                  />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="intent" value={intent} />

        {state?.error && !state.fieldErrors && (
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
            <AlertTitle>Could not create the account</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {state?.success && (
          <Alert>
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={1.8}
              className="size-4 text-foreground"
              aria-hidden="true"
            />
            <AlertTitle>Account created</AlertTitle>
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
        )}

        {intent === "STAFF" && (
          <div className="space-y-3 rounded-lg border border-foreground/15 bg-muted/50 p-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Ticket01Icon}
                  strokeWidth={1.8}
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Label
                  htmlFor="inviteToken"
                  className="text-xs font-semibold text-foreground"
                >
                  Shop Invitation Code *
                </Label>
              </div>
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
            <p className="text-[11px] leading-relaxed text-muted-foreground">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <p className="pt-1 text-center text-[11px] text-muted-foreground">
          {intent === "STAFF"
            ? "Your staff account will be linked to your shop upon registration."
            : "Next step: configure your provider details in onboarding."}
        </p>
      </form>
    </div>
  );
}
