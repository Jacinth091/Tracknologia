"use client";

import { useActionState, useState } from "react";
import { inviteStaffAction, revokeStaffAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import type { ProviderInvitation, TeamMember } from "@/features/providers";

interface TeamClientProps {
  isOwner: boolean;
  isShop: boolean;
  members: TeamMember[];
  invitations: ProviderInvitation[];
}

export function TeamClient({ isOwner, isShop, members, invitations }: TeamClientProps) {
  const [state, formAction, isPending] = useActionState(inviteStaffAction, null);
  const [copied, setCopied] = useState(false);

  if (!isShop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Independent Provider Team</CardTitle>
          <CardDescription>
            Independent repairers operate as solo technicians and manage repairs directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Staff invitations and multi-technician teams are designed for <strong>Repair Shops</strong>. If you decide to expand into a repair workshop with multiple technicians in the future, you can upgrade your provider profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Invite Staff Member Card (Owners Only) */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Invite a Staff Technician</CardTitle>
            <CardDescription>
              Generate an invitation link for technicians to join your repair shop
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={formAction} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="staff-email" className="sr-only">
                  Technician Email
                </Label>
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  placeholder="technician@example.com"
                  disabled={isPending}
                  required
                />
                {state?.fieldErrors?.email && (
                  <p className="text-xs text-destructive">{state.fieldErrors.email}</p>
                )}
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    Generating...
                  </span>
                ) : (
                  "Create Staff Invite"
                )}
              </Button>
            </form>

            {state?.error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                {state.error}
              </div>
            )}

            {/* Generated Invite Box */}
            {state?.token && state.inviteUrl && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">Invitation Link Generated!</span>
                  <span className="text-[11px] text-muted-foreground">Valid for 7 days</span>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}${state.inviteUrl}`}
                    className="bg-background font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleCopy(
                        `${typeof window !== "undefined" ? window.location.origin : ""}${state.inviteUrl}`,
                      )
                    }
                  >
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Invite Code:</span>
                  <code className="bg-background px-2 py-0.5 rounded border border-border font-mono font-medium text-foreground">
                    {state.token}
                  </code>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2. Pending Invitations */}
      {isOwner && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Pending Staff Invitations</CardTitle>
            <CardDescription>
              Unaccepted invitations sent to technicians
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              {invitations.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Code: <code className="font-mono">{inv.tokenHash}</code> • Expires{" "}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleCopy(
                          `${typeof window !== "undefined" ? window.location.origin : ""}/register?invite=${inv.tokenHash}`,
                        )
                      }
                      className="text-xs"
                    >
                      Copy Link
                    </Button>
                    <form action={revokeStaffAction}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <Button variant="ghost" size="sm" type="submit" className="text-xs text-destructive hover:text-destructive">
                        Revoke
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Active Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Team Members</CardTitle>
          <CardDescription>Active staff and technicians belonging to this shop</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/60">
            {members.map((member) => (
              <div key={member.membershipId} className="py-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    User: {member.userId.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined on {new Date(member.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold",
                    member.role === "OWNER"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {member.role === "OWNER" ? "Shop Owner" : "Staff Technician"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
