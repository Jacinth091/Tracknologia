"use client";

import { useActionState, useState } from "react";
import {
  onboardIndependentAction,
  onboardShopAction,
  acceptStaffInviteAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface OnboardingClientProps {
  defaultInviteToken?: string;
  initialProviderType?: "SHOP" | "INDEPENDENT";
  initialDisplayName?: string;
  initialEmail?: string;
}

export function OnboardingClient({
  defaultInviteToken,
  initialProviderType,
  initialDisplayName,
  initialEmail,
}: OnboardingClientProps) {
  // If the user registered as a specific provider type or has an invite token, lock to that sole flow
  const lockedType = defaultInviteToken ? "STAFF" : initialProviderType;
  const [selectedType, setSelectedType] = useState<"INDEPENDENT" | "SHOP" | "STAFF">(
    lockedType ?? "INDEPENDENT",
  );

  const [indState, indAction, indPending] = useActionState(onboardIndependentAction, null);
  const [shopState, shopAction, shopPending] = useActionState(onboardShopAction, null);
  const [staffState, staffAction, staffPending] = useActionState(acceptStaffInviteAction, null);

  const isPending = indPending || shopPending || staffPending;
  const currentFlow = lockedType ?? selectedType;

  return (
    <div className="space-y-6">
      {/* Only show tab switcher if the user did not register as a specific account type */}
      {!lockedType && (
        <div className="grid grid-cols-3 gap-2 p-1 bg-muted/60 rounded-2xl border border-border/80">
          <button
            type="button"
            onClick={() => setSelectedType("INDEPENDENT")}
            disabled={isPending}
            className={cn(
              "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
              selectedType === "INDEPENDENT"
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Independent
          </button>

          <button
            type="button"
            onClick={() => setSelectedType("SHOP")}
            disabled={isPending}
            className={cn(
              "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
              selectedType === "SHOP"
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Repair Shop
          </button>

          <button
            type="button"
            onClick={() => setSelectedType("STAFF")}
            disabled={isPending}
            className={cn(
              "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
              selectedType === "STAFF"
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Shop Staff (Invite)
          </button>
        </div>
      )}

      {/* 1. Independent Repairer Sole Onboarding */}
      {currentFlow === "INDEPENDENT" && (
        <form action={indAction} className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🛠️</span>
              <h3 className="text-sm font-semibold text-foreground">Independent Repairer Profile</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Confirm your brand name, contact info, and service coverage. No physical storefront address required.
            </p>
          </div>

          {indState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {indState.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ind-name">Your Name / Repair Brand *</Label>
            <Input
              id="ind-name"
              name="displayName"
              defaultValue={initialDisplayName ?? ""}
              placeholder="e.g. Alex Tech Services"
              disabled={isPending}
              required
            />
            {indState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">{indState.fieldErrors.displayName}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ind-email">Contact Email</Label>
              <Input
                id="ind-email"
                name="contactEmail"
                type="email"
                defaultValue={initialEmail ?? ""}
                placeholder="alex@mobiletech.com"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ind-phone">Contact Phone</Label>
              <Input
                id="ind-phone"
                name="contactPhone"
                type="tel"
                placeholder="+63 912 345 6789"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ind-area">Service Area / Coverage (Optional)</Label>
            <Input
              id="ind-area"
              name="serviceArea"
              placeholder="e.g. Metro Cebu, Mandaue, Home Service"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Supported Device Categories (Optional)</Label>
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
            {indPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Setting up Independent Provider...
              </span>
            ) : (
              "Complete Setup & Go to Dashboard"
            )}
          </Button>
        </form>
      )}

      {/* 2. Repair Shop Owner Sole Onboarding */}
      {currentFlow === "SHOP" && (
        <form action={shopAction} className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🏬</span>
              <h3 className="text-sm font-semibold text-foreground">Repair Shop Profile</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure your shop information and public storefront location to start managing repairs and staff.
            </p>
          </div>

          {shopState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {shopState.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="shop-name">Shop / Business Name *</Label>
            <Input
              id="shop-name"
              name="displayName"
              defaultValue={initialDisplayName ?? ""}
              placeholder="e.g. Apex Electronics Repair Center"
              disabled={isPending}
              required
            />
            {shopState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">{shopState.fieldErrors.displayName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-address">Public Storefront Address (Optional)</Label>
            <Input
              id="shop-address"
              name="publicAddress"
              placeholder="e.g. Unit 102, Tech Plaza, Downtown"
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shop-email">Shop Contact Email</Label>
              <Input
                id="shop-email"
                name="contactEmail"
                type="email"
                defaultValue={initialEmail ?? ""}
                placeholder="owner@apexrepairs.com"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop-phone">Shop Phone (Optional)</Label>
              <Input
                id="shop-phone"
                name="contactPhone"
                type="tel"
                placeholder="(032) 123-4567"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-area">Service Area / Region (Optional)</Label>
            <Input
              id="shop-area"
              name="serviceArea"
              placeholder="e.g. Greater Cebu Area"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Supported Device Categories (Optional)</Label>
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
            {shopPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Registering Repair Shop...
              </span>
            ) : (
              "Complete Setup & Go to Dashboard"
            )}
          </Button>
        </form>
      )}

      {/* 3. Shop Staff Invitation Acceptance Sole Flow */}
      {currentFlow === "STAFF" && (
        <form action={staffAction} className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">👥</span>
              <h4 className="text-sm font-semibold text-foreground">Join Repair Shop Team</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Confirm your shop invitation code to link your account and access the repair workshop dashboard.
            </p>
          </div>

          {staffState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {staffState.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="invite-token">Invitation Token / Code *</Label>
            <Input
              id="invite-token"
              name="token"
              defaultValue={defaultInviteToken ?? ""}
              placeholder="Paste invitation token here"
              disabled={isPending}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              {defaultInviteToken
                ? "Your invitation code was prefilled from your registration."
                : "Staff join via an invitation code provided by the Shop Owner."}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {staffPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Connecting to shop...
              </span>
            ) : (
              "Confirm & Enter Shop Dashboard"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
