import type { Metadata } from "next";
import { requireProviderContext } from "@/features/auth";
import {
  getProvider,
  listPendingStaffInvitations,
  listTeamMembers,
} from "@/features/providers";
import { getAppOrigin } from "@/lib/config/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { RequestLinkCard } from "../_components/request-link-card";
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

  const [members, invitations, provider] = await Promise.all([
    listTeamMembers(context.providerId, supabase),
    isOwner && isShop
      ? listPendingStaffInvitations(context.providerId, supabase)
      : Promise.resolve([]),
    getProvider(context.providerId, supabase),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Team & Staff Management"
        description={`Manage staff members, invitations, and workshop access for ${context.providerName}`}
      />

      <TeamClient
        isOwner={isOwner}
        isShop={isShop}
        members={members}
        invitations={invitations}
        requestLink={
          provider ? (
            <RequestLinkCard
              url={`${getAppOrigin()}/p/${provider.slug}/request`}
              acceptingRequests={provider.acceptingRequests}
            />
          ) : null
        }
      />
    </div>
  );
}
