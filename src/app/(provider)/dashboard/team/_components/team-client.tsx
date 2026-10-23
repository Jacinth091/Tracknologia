"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Mail01Icon,
  UserAdd01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import {
  inviteStaffAction,
  removeStaffAction,
  revokeStaffAction,
} from "../actions";
import { CopyButton } from "@/components/shared/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { ProviderInvitation, TeamMember } from "@/features/providers";

interface TeamClientProps {
  isOwner: boolean;
  isShop: boolean;
  members: TeamMember[];
  invitations: ProviderInvitation[];
  requestLink?: ReactNode;
}

export function TeamClient({
  isOwner,
  isShop,
  members,
  invitations,
  requestLink,
}: TeamClientProps) {
  const [state, formAction, isPending] = useActionState(
    inviteStaffAction,
    null,
  );
  const [revokeState, revokeFormAction, isRevokePending] = useActionState(
    revokeStaffAction,
    null,
  );
  const [removeState, removeFormAction, isRemovePending] = useActionState(
    removeStaffAction,
    null,
  );
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(
    null,
  );

  if (!isShop) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Empty className="border">
            <EmptyMedia variant="icon">
              <HugeiconsIcon
                icon={UserGroupIcon}
                strokeWidth={1.8}
                aria-hidden="true"
              />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Independent Provider Team</EmptyTitle>
              <EmptyDescription>
                Independent repairers operate independently and manage repairs
                directly. Staff invitations and multi-member teams are designed
                for Repair Shops — Independent Providers remain single-member
                workspaces in the current product model.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const staffMembers = members.filter((member) => member.role === "STAFF");

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="w-full space-y-6 empty:hidden lg:w-1/3 lg:shrink-0">
        {/* 1. Invite Staff Member Card (Owners Only) */}
        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-lg font-semibold">
                <HugeiconsIcon
                  icon={UserAdd01Icon}
                  strokeWidth={1.8}
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Invite Staff
              </CardTitle>
              <CardDescription>
                Generate an invitation link or email an invitation to staff to
                join your repair shop
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                action={formAction}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <div className="flex-1 space-y-1">
                  <Label htmlFor="staff-email" className="sr-only">
                    Staff Email
                  </Label>
                  <Input
                    id="staff-email"
                    name="email"
                    type="email"
                    placeholder="staff@example.com"
                    disabled={isPending}
                    required
                  />
                  {state?.fieldErrors?.email && (
                    <p className="text-xs text-destructive">
                      {state.fieldErrors.email}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto"
                >
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
                <Alert variant="destructive">
                  <HugeiconsIcon
                    icon={AlertCircleIcon}
                    strokeWidth={1.8}
                    className="size-4"
                    aria-hidden="true"
                  />
                  <AlertTitle>Could not create the invitation</AlertTitle>
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              )}

              {state?.reused && (
                <Alert role="status">
                  <HugeiconsIcon
                    icon={Mail01Icon}
                    strokeWidth={1.8}
                    className="size-4 text-foreground"
                    aria-hidden="true"
                  />
                  <AlertTitle>Invitation already pending</AlertTitle>
                  <AlertDescription>{state.success}</AlertDescription>
                </Alert>
              )}

              {/* Generated Invite Box (Displayed strictly once at creation time) */}
              {state?.token && state.inviteUrl && (
                <div className="space-y-3 rounded-lg border border-foreground/15 bg-primary/10 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {state.emailDeliveryFailed
                        ? "Invitation Created (Email Failed)"
                        : "Invitation Created & Sent!"}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      Valid 7 days
                    </span>
                  </div>

                  {state.emailDeliveryFailed && (
                    <Alert variant="destructive">
                      <HugeiconsIcon
                        icon={AlertCircleIcon}
                        strokeWidth={1.8}
                        className="size-4"
                        aria-hidden="true"
                      />
                      <AlertTitle>
                        Email delivery could not be completed
                      </AlertTitle>
                      <AlertDescription>
                        Copy the invitation link below and share it directly
                        with your staff member.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center gap-2">
                    <Input
                      ref={inviteInputRef}
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}${state.inviteUrl}`}
                      className="bg-background font-mono text-xs"
                    />
                    <CopyButton
                      text={`${typeof window !== "undefined" ? window.location.origin : ""}${state.inviteUrl}`}
                      targetRef={inviteInputRef}
                      label="Copy Link"
                      copiedLabel="Copied!"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Invite Code:</span>
                    <code className="rounded border border-border bg-background px-2 py-0.5 font-mono font-medium text-foreground">
                      {state.token}
                    </code>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isOwner && revokeState?.success && (
          <Alert role="status">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={1.8}
              className="size-4 text-foreground"
              aria-hidden="true"
            />
            <AlertTitle>Invitation revoked</AlertTitle>
          </Alert>
        )}

        {isOwner && revokeState?.error && (
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
            <AlertTitle>Unable to revoke invitation</AlertTitle>
            <AlertDescription>{revokeState.error}</AlertDescription>
          </Alert>
        )}

        {isOwner && removeState?.success && (
          <Alert role="status">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={1.8}
              className="size-4 text-foreground"
              aria-hidden="true"
            />
            <AlertTitle>Access revoked</AlertTitle>
            <AlertDescription>{removeState.success}</AlertDescription>
          </Alert>
        )}

        {isOwner && removeState?.error && (
          <Alert variant="destructive">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              strokeWidth={1.8}
              className="size-4"
              aria-hidden="true"
            />
            <AlertTitle>Unable to remove staff</AlertTitle>
            <AlertDescription>{removeState.error}</AlertDescription>
          </Alert>
        )}

        {/* 2. Pending Invitations (No credentials / hashes displayed) */}
        {isOwner && invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5 text-lg font-semibold">
                <HugeiconsIcon
                  icon={Mail01Icon}
                  strokeWidth={1.8}
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Pending Staff Invitations
              </CardTitle>
              <CardDescription>
                Unaccepted invitations sent to staff members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/60">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0 space-y-0.5 wrap-anywhere">
                      <p className="text-sm font-medium text-foreground">
                        {inv.email}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        Sent {new Date(inv.createdAt).toLocaleDateString()} •
                        Expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={revokeFormAction}>
                        <input
                          type="hidden"
                          name="invitationId"
                          value={inv.id}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          type="submit"
                          disabled={isRevokePending}
                          className="text-xs text-destructive hover:text-destructive"
                        >
                          {isRevokePending ? "Revoking..." : "Revoke"}
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {requestLink}
      </div>

      <div className="min-w-0 flex-1">
        {/* 3. Active Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5 text-lg font-semibold">
              <HugeiconsIcon
                icon={UserGroupIcon}
                strokeWidth={1.8}
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Team Members ({members.length})
            </CardTitle>
            <CardDescription>
              Active staff belonging to this repair shop
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              {members.map((member) => {
                const displayName = member.displayName || "Team Member";
                const initials = displayName.charAt(0).toUpperCase();

                return (
                  <div
                    key={member.membershipId}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                      <Avatar size="lg">
                        <AvatarFallback className="bg-foreground text-xs font-semibold text-background">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {displayName}
                          </span>
                          <Badge
                            variant={
                              member.role === "OWNER" ? "default" : "outline"
                            }
                          >
                            {member.role === "OWNER" ? "Shop Owner" : "Staff"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                          {member.contactPhone && (
                            <>
                              <span>{member.contactPhone}</span>
                              <span>•</span>
                            </>
                          )}
                          <span>
                            Joined{" "}
                            {new Date(member.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isOwner && member.role === "STAFF" && (
                      <div className="shrink-0">
                        {confirmingRemovalId === member.membershipId ? (
                          <form
                            action={removeFormAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="membershipId"
                              value={member.membershipId}
                            />
                            <span className="text-xs text-muted-foreground">
                              Remove access?
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              type="submit"
                              disabled={isRemovePending}
                              className="text-xs"
                            >
                              {isRemovePending ? "Removing..." : "Confirm"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              disabled={isRemovePending}
                              className="text-xs"
                              onClick={() => setConfirmingRemovalId(null)}
                            >
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            className="text-xs text-destructive hover:text-destructive"
                            onClick={() =>
                              setConfirmingRemovalId(member.membershipId)
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {staffMembers.length === 0 && (
              <Empty className="mt-2 border">
                <EmptyMedia variant="icon">
                  <HugeiconsIcon
                    icon={UserGroupIcon}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No staff members yet</EmptyTitle>
                  <EmptyDescription>
                    Invite a teammate to share repairs, updates and handovers
                    with your shop.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
