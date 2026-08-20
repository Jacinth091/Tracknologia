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
          Select Your Account Type
        </Label>
        <div
          role="radiogroup"
          aria-label="Provider Account Type"
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
              Mobile techs & solo repairers. No physical shop needed.
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
              Join an existing shop via Owner invitation link.
            </span>
          </button>
        </div>
      </div>

      {/* Path 1: Independent Repairer Registration */}
      {onboardingType === "INDEPENDENT" && (
        <form action={registerFormAction} className="space-y-4">
          <input type="hidden" name="providerType" value="INDEPENDENT" />

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
            <Label htmlFor="ind-displayName">Your Name / Repair Brand *</Label>
            <Input
              id="ind-displayName"
              name="displayName"
              type="text"
              placeholder="e.g. Alex Tech Services or Alex Repairs"
              disabled={isPending}
              required
            />
            {registerState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">{registerState.fieldErrors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ind-email">Email Address *</Label>
            <Input
              id="ind-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="alex@mobiletech.com"
              disabled={isPending}
              required
            />
            {registerState?.fieldErrors?.email && (
              <p className="text-xs text-destructive">{registerState.fieldErrors.email}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ind-password">Password *</Label>
              <PasswordInput
                id="ind-password"
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
              <Label htmlFor="ind-confirmPassword">Confirm Password *</Label>
              <PasswordInput
                id="ind-confirmPassword"
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
                Setting up Independent Provider...
              </span>
            ) : (
              "Create Independent Account"
            )}
          </Button>
        </form>
      )}

      {/* Path 2: Repair Shop Owner Registration */}
      {onboardingType === "SHOP" && (
        <form action={registerFormAction} className="space-y-4">
          <input type="hidden" name="providerType" value="SHOP" />

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
            <Label htmlFor="shop-displayName">Shop / Business Name *</Label>
            <Input
              id="shop-displayName"
              name="displayName"
              type="text"
              placeholder="e.g. Apex Phone Repair Center"
              disabled={isPending}
              required
            />
            {registerState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">{registerState.fieldErrors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-email">Work Email *</Label>
            <Input
              id="shop-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="owner@apexrepairs.com"
              disabled={isPending}
              required
            />
            {registerState?.fieldErrors?.email && (
              <p className="text-xs text-destructive">{registerState.fieldErrors.email}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shop-password">Password *</Label>
              <PasswordInput
                id="shop-password"
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
              <Label htmlFor="shop-confirmPassword">Confirm Password *</Label>
              <PasswordInput
                id="shop-confirmPassword"
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
                Setting up Repair Shop...
              </span>
            ) : (
              "Create Shop Owner Account"
            )}
          </Button>
        </form>
      )}

      {/* Path 3: Shop Staff Invitation Flow (LD-01) */}
      {onboardingType === "STAFF" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-muted/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-base">ℹ️</span>
              <h4 className="text-sm font-semibold text-foreground">How Staff Onboarding Works</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tracknologia protects shop security by requiring an <strong>Owner-authorized invitation link</strong> to join an existing shop. Shop staff cannot self-join without an invitation.
            </p>
          </div>

          <form action={staffFormAction} className="space-y-4">
            {staffState?.error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                {staffState.error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="staff-token">Invitation Token / Code</Label>
              <Input
                id="staff-token"
                name="token"
                defaultValue={initialInvite ?? ""}
                placeholder="Paste the invitation token from your Shop Owner"
                disabled={isPending}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                If you already received an invite link, open that link directly to join your shop.
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
        </div>
      )}
    </div>
  );
}
