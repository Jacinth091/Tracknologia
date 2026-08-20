"use client";

import { useActionState, useState } from "react";
import { registerAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const [providerType, setProviderType] = useState<"SHOP" | "INDEPENDENT">("SHOP");

  return (
    <div className="relative">
      {/* Loading Overlay */}
      {isPending && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-background/60 backdrop-blur-[1px] transition-all">
          <div className="flex items-center gap-2 rounded-xl bg-card border border-border/80 px-4 py-2 shadow-md">
            <LoadingSpinner size="sm" className="text-primary border-primary border-t-transparent" />
            <span className="text-xs font-medium text-foreground">
              Creating your provider account...
            </span>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        {state?.error && !state.fieldErrors && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive font-medium">
            {state.error}
          </div>
        )}

        {state?.success && (
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-sm text-primary font-medium">
            {state.success}
          </div>
        )}

        {/* Accessible Provider Type Selection */}
        <div className="space-y-2">
          <Label id="provider-type-label">Provider Type</Label>
          <input type="hidden" name="providerType" value={providerType} />
          <div
            role="radiogroup"
            aria-labelledby="provider-type-label"
            className="grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={providerType === "SHOP"}
              disabled={isPending}
              onClick={() => setProviderType("SHOP")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer",
                providerType === "SHOP"
                  ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/20"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50",
              )}
            >
              <span className="text-sm font-semibold text-foreground">Repair Shop</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Storefront or workshop
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={providerType === "INDEPENDENT"}
              disabled={isPending}
              onClick={() => setProviderType("INDEPENDENT")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer",
                providerType === "INDEPENDENT"
                  ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/20"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50",
              )}
            >
              <span className="text-sm font-semibold text-foreground">Independent</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Freelancer / mobile repairer
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">
            {providerType === "SHOP" ? "Shop / Business Name" : "Your Name / Brand"}
          </Label>
          <Input
            id="displayName"
            name="displayName"
            type="text"
            placeholder={providerType === "SHOP" ? "Apex Phone Repair" : "Alex Tech Services"}
            disabled={isPending}
            required
          />
          {state?.fieldErrors?.displayName && (
            <p className="text-xs text-destructive">{state.fieldErrors.displayName}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Work Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="owner@repairshop.com"
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
            "Register as Provider"
          )}
        </Button>
      </form>
    </div>
  );
}
