import type { Metadata } from "next";
import { requireProviderContext } from "@/features/auth";
import { listPendingStaffInvitations, listTeamMembers } from "@/features/providers";
import { createClient } from "@/lib/supabase/server";
import { TeamClient } from "./_components/team-client";

export const metadata: Metadata = {
  title: "Team & Staff — Tracknologia",
  description: "Manage repair shop staff members and invitations",
};

export default async function TeamPage() {
  const supabase = await createClient();
  const context = await requireProviderContext(supabase);

  const isOwner = context.role === "OWNER";
  const isShop = context.providerType === "SHOP";

  const [members, invitations] = await Promise.all([
    listTeamMembers(context.providerId, supabase),
    isOwner && isShop ? listPendingStaffInvitations(context.providerId, supabase) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
          Team & Staff Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage staff members, invitations, and workshop access for {context.providerName}
        </p>
      </div>

      <TeamClient
        isOwner={isOwner}
        isShop={isShop}
        members={members}
        invitations={invitations}
      />
    </div>
  );
}

