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
  const [activeTab, setActiveTab] = useState<"INDEPENDENT" | "SHOP" | "STAFF">(
    defaultInviteToken
      ? "STAFF"
      : initialProviderType === "SHOP"
        ? "SHOP"
        : "INDEPENDENT",
  );

  const [indState, indAction, indPending] = useActionState(onboardIndependentAction, null);
  const [shopState, shopAction, shopPending] = useActionState(onboardShopAction, null);
  const [staffState, staffAction, staffPending] = useActionState(acceptStaffInviteAction, null);

  const isPending = indPending || shopPending || staffPending;

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-muted/60 rounded-2xl border border-border/80">
        <button
          type="button"
          onClick={() => setActiveTab("INDEPENDENT")}
          disabled={isPending}
          className={cn(
            "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "INDEPENDENT"
              ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Independent
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SHOP")}
          disabled={isPending}
          className={cn(
            "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "SHOP"
              ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Repair Shop
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("STAFF")}
          disabled={isPending}
          className={cn(
            "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "STAFF"
              ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Shop Staff (Invite)
        </button>
      </div>

      {/* 1. Independent Repairer Onboarding */}
      {activeTab === "INDEPENDENT" && (
        <form action={indAction} className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <h3 className="text-sm font-semibold text-foreground">Independent Repairer Profile</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Designed for freelancers, mobile techs, and home-service specialists. No store address required.
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
            <Label htmlFor="ind-area">Service Area / Coverage</Label>
            <Input
              id="ind-area"
              name="serviceArea"
              placeholder="e.g. Cebu City, Mandaue, Home Service"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
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
            {indPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Setting up Independent Provider...
              </span>
            ) : (
              "Complete Independent Onboarding"
            )}
          </Button>
        </form>
      )}

      {/* 2. Shop Owner Onboarding */}
      {activeTab === "SHOP" && (
        <form action={shopAction} className="space-y-4">
          <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
            <h3 className="text-sm font-semibold text-foreground">Repair Shop Profile</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              For storefront repair centers, workshops, and multi-technician teams.
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
            <Label htmlFor="shop-address">Public Shop Address</Label>
            <Input
              id="shop-address"
              name="publicAddress"
              placeholder="e.g. Unit 102, Tech Plaza, Downtown"
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shop-email">Shop Email</Label>
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
              <Label htmlFor="shop-phone">Shop Phone</Label>
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
            <Label htmlFor="shop-area">Service Area / Region</Label>
            <Input
              id="shop-area"
              name="serviceArea"
              placeholder="e.g. Greater Cebu Area"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
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
            {shopPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Registering Repair Shop...
              </span>
            ) : (
              "Complete Shop Onboarding"
            )}
          </Button>
        </form>
      )}

      {/* 3. Shop Staff Invitation Acceptance */}
      {activeTab === "STAFF" && (
        <form action={staffAction} className="space-y-4">
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
              Staff cannot self-join without an Owner invitation. If you don&apos;t have a code, ask your shop owner.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {staffPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Validating invitation...
              </span>
            ) : (
              "Accept Invitation & Join Shop"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
