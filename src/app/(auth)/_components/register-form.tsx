"use client";

import { useActionState, useState } from "react";
import { registerAction } from "../actions";
import { acceptStaffInviteAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

const DEVICE_OPTIONS = [
  "Smartphones",
  "Laptops & PCs",
  "Tablets",
  "Gaming Consoles",
  "Audio & Wearables",
  "Other Electronics",
];

export function RegisterForm({ initialInvite }: { initialInvite?: string }) {
  const [onboardingType, setOnboardingType] = useState<"INDEPENDENT" | "SHOP" | "STAFF">(
    initialInvite ? "STAFF" : "INDEPENDENT",
  );

  const [registerState, registerFormAction, isRegisterPending] = useActionState(
    registerAction,
    null,
  );
  const [staffState, staffFormAction, isStaffPending] = useActionState(
    acceptStaffInviteAction,
    null,
  );

  const isPending = isRegisterPending || isStaffPending;

  return (
    <div className="space-y-6">
      {/* 3 Onboarding Path Cards (LD-01) */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Select Your Path
        </Label>
        <div
          role="radiogroup"
          aria-label="Provider Onboarding Path"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        >
          {/* Path 1: Independent */}
          <button
            type="button"
            role="radio"
            aria-checked={onboardingType === "INDEPENDENT"}
            disabled={isPending}
            onClick={() => setOnboardingType("INDEPENDENT")}
            className={cn(
              "flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all cursor-pointer relative",
              onboardingType === "INDEPENDENT"
                ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/20 shadow-xs"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🛠️</span>
              <span className="text-sm font-semibold text-foreground">Independent</span>
            </div>
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              Mobile techs & solo repairers. No store address needed.
            </span>
          </button>

          {/* Path 2: Shop Owner */}
          <button
            type="button"
            role="radio"
            aria-checked={onboardingType === "SHOP"}
            disabled={isPending}
            onClick={() => setOnboardingType("SHOP")}
            className={cn(
              "flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all cursor-pointer relative",
              onboardingType === "SHOP"
                ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/20 shadow-xs"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🏬</span>
              <span className="text-sm font-semibold text-foreground">Repair Shop</span>
            </div>
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              Storefronts, workshops & multi-tech businesses.
            </span>
          </button>

          {/* Path 3: Shop Staff */}
          <button
            type="button"
            role="radio"
            aria-checked={onboardingType === "STAFF"}
            disabled={isPending}
            onClick={() => setOnboardingType("STAFF")}
            className={cn(
              "flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all cursor-pointer relative",
              onboardingType === "STAFF"
                ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/20 shadow-xs"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">👥</span>
              <span className="text-sm font-semibold text-foreground">Shop Staff</span>
            </div>
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              Joining an existing repair shop via owner invite.
            </span>
          </button>
        </div>
      </div>

      {/* Path 1 & 2: Provider Owner Registration (Independent & Shop Owner) */}
      {onboardingType !== "STAFF" && (
        <form action={registerFormAction} className="space-y-4">
          <input type="hidden" name="providerType" value={onboardingType} />

          {registerState?.error && !registerState.fieldErrors && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {registerState.error}
            </div>
          )}

          {registerState?.success && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs text-primary font-medium">
              {registerState.success}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="displayName">
              {onboardingType === "SHOP" ? "Shop / Business Name *" : "Your Name / Repair Brand *"}
            </Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              placeholder={onboardingType === "SHOP" ? "e.g. Apex Phone Repair Center" : "e.g. Alex Tech Services"}
              disabled={isPending}
              required
            />
            {registerState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">{registerState.fieldErrors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={onboardingType === "SHOP" ? "owner@apexrepairs.com" : "alex@mobiletech.com"}
              disabled={isPending}
              required
            />
            {registerState?.fieldErrors?.email && (
              <p className="text-xs text-destructive">{registerState.fieldErrors.email}</p>
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
              {registerState?.fieldErrors?.password && (
                <p className="text-xs text-destructive">{registerState.fieldErrors.password}</p>
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
              {registerState?.fieldErrors?.confirmPassword && (
                <p className="text-xs text-destructive">{registerState.fieldErrors.confirmPassword}</p>
              )}
            </div>
          </div>

          {/* Supported Devices Chips */}
          <div className="space-y-2 pt-1">
            <Label className="text-xs text-muted-foreground">Supported Devices (Optional)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEVICE_OPTIONS.map((device) => (
                <label
                  key={device}
                  className="flex items-center gap-2 rounded-xl border border-border/70 p-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name="supportedDevices"
                    value={device}
                    className="rounded border-border accent-primary"
                    disabled={isPending}
                  />
                  <span>{device}</span>
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isRegisterPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                Setting up your account...
              </span>
            ) : onboardingType === "SHOP" ? (
              "Create Shop Owner Account"
            ) : (
              "Create Independent Account"
            )}
          </Button>
        </form>
      )}

      {/* Path 3: Shop Staff Invitation Acceptance (LD-01) */}
      {onboardingType === "STAFF" && (
        <form action={staffFormAction} className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-muted/40 p-4 space-y-1">
            <h4 className="text-sm font-semibold text-foreground">Join an Existing Repair Shop</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tracknologia requires an Owner-authorized invitation to join a shop. If you received an invite link or token, enter it below.
            </p>
          </div>

          {staffState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {staffState.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="staff-token">Invitation Token / Code *</Label>
            <Input
              id="staff-token"
              name="token"
              defaultValue={initialInvite ?? ""}
              placeholder="Paste invite code from your Shop Owner"
              disabled={isPending}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Don&apos;t have an invite? Ask your Shop Owner to generate an invitation for you.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isStaffPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                Verifying invite...
              </span>
            ) : (
              "Accept Invite & Join Shop"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
