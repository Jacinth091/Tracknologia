import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getInvitationDetailsByTokenHash,
  getProviderById,
  getProviderUserProfile as getProviderUserProfilePersistence,
  getPublicProviderProfile,
  hashInvitationToken,
  listStaffInvitations as listStaffInvitationsPersistence,
  listTeamMembers as listTeamMembersPersistence,
} from "./persistence";
import type {
  InvitationShopDetails,
  Provider,
  ProviderInvitation,
  ProviderUserProfile,
  PublicProviderProfile,
  TeamMember,
} from "./types";

export async function getProvider(
  providerId: string,
  client?: SupabaseClient,
): Promise<Provider | null> {
  const supabase = client ?? (await createClient());
  return getProviderById(supabase, providerId);
}

export async function getPublicProvider(
  slugOrId: string,
  client?: SupabaseClient,
): Promise<PublicProviderProfile | null> {
  const supabase = client ?? (await createClient());
  return getPublicProviderProfile(supabase, slugOrId);
}

export async function getInvitationForOnboarding(
  rawToken: string,
  client?: SupabaseClient,
): Promise<InvitationShopDetails | null> {
  const supabase = client ?? (await createClient());
  const tokenHash = hashInvitationToken(rawToken);
  return getInvitationDetailsByTokenHash(supabase, tokenHash);
}

export async function listTeamMembers(
  providerId: string,
  client?: SupabaseClient,
): Promise<TeamMember[]> {
  const supabase = client ?? (await createClient());
  return listTeamMembersPersistence(supabase, providerId);
}

export async function listPendingStaffInvitations(
  providerId: string,
  client?: SupabaseClient,
): Promise<ProviderInvitation[]> {
  const supabase = client ?? (await createClient());
  return listStaffInvitationsPersistence(supabase, providerId);
}

export async function getProviderUserProfile(
  userId: string,
  client?: SupabaseClient,
): Promise<ProviderUserProfile | null> {
  const supabase = client ?? (await createClient());
  return getProviderUserProfilePersistence(supabase, userId);
}
