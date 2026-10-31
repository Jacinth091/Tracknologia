"use client";

import { useActionState, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Store01Icon,
  UserGroupIcon,
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
  const [changingInvite, setChangingInvite] = useState(false);
  const [state, formAction, isPending] = useActionState(registerAction, null);
  // A code that arrived with the link stays out of the way until someone asks
  // to change it, unless the server rejected it and the field must be shown.
  const inviteCollapsed =
    Boolean(initialInvite) &&
    !changingInvite &&
    !state?.fieldErrors?.inviteToken;

  return (
    <div className="space-y-6">
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
                "flex cursor-pointer flex-col gap-3 rounded-lg border border-input bg-card p-4 transition-colors hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring has-[:checked]:border-foreground has-[:checked]:bg-muted/50",
                isPending && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="account-intent"
                value={option.value}
                checked={selected}
                disabled={isPending}
                onChange={() => setIntent(option.value)}
                aria-labelledby={`intent-${option.value}-title`}
                aria-describedby={`intent-${option.value}-description`}
                className="sr-only"
              />
              <HugeiconsIcon
                icon={option.icon}
                strokeWidth={1.8}
                className="size-5 text-foreground"
                aria-hidden="true"
              />
              <span
                id={`intent-${option.value}-title`}
                className="block text-sm font-semibold"
              >
                {option.label}
              </span>
              <span
                id={`intent-${option.value}-description`}
                className="block text-xs leading-relaxed text-muted-foreground"
              >
                {option.description}
              </span>
            </label>
          );
        })}
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
          <div className="space-y-2">
            {inviteCollapsed && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <span>Invite code added ✓</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setChangingInvite(true)}
                >
                  Change
                </Button>
              </div>
            )}
            {/* Stays in the form when collapsed, so the code still submits. */}
            <div hidden={inviteCollapsed} className="space-y-2">
              <Label htmlFor="inviteToken">Shop Invitation Code *</Label>
              <Input
                id="inviteToken"
                name="inviteToken"
                defaultValue={initialInvite ?? ""}
                placeholder="Paste the invitation token from your Shop Owner"
                disabled={isPending}
                required
                aria-describedby="inviteToken-help"
              />
              {state?.fieldErrors?.inviteToken && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.inviteToken}
                </p>
              )}
              <p
                id="inviteToken-help"
                className="text-xs text-muted-foreground"
              >
                Ask your Shop Owner for an invite link.
              </p>
            </div>
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
            "Join shop"
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </div>
  );
}
