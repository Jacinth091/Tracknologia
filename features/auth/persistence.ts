import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { ProviderMembership, ProviderRole, ProviderType } from "./types";

interface ProviderMembershipRow {
  id: string;
  provider_id: string;
  user_id: string;
  role: ProviderRole;
  created_at: string;
  providers?: {
    display_name: string;
    provider_type: ProviderType;
  } | null;
}

export interface ProviderMembershipWithDetails extends ProviderMembership {
  providerName: string;
  providerType: ProviderType;
}

export async function findMembershipByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProviderMembershipWithDetails | null> {
  const { data, error } = await supabase
    .from("provider_memberships")
    .select("id, provider_id, user_id, role, created_at, providers!inner(display_name, provider_type)")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch provider membership: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as ProviderMembershipRow;
  const provider = row.providers;

  return {
    id: row.id,
    providerId: row.provider_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    providerName: provider?.display_name ?? "Provider",
    providerType: provider?.provider_type ?? "SHOP",
  };
}

export async function createMembership(
  supabase: SupabaseClient,
  membership: {
    providerId: string;
    userId: string;
    role: ProviderRole;
  },
): Promise<ProviderMembership> {
  const { data, error } = await supabase
    .from("provider_memberships")
    .insert({
      provider_id: membership.providerId,
      user_id: membership.userId,
      role: membership.role,
    })
    .select("id, provider_id, user_id, role, created_at")
    .single();

  if (error) {
    throw new Error(`Failed to create provider membership: ${error.message}`);
  }

  const row = data as ProviderMembershipRow;
  return {
    id: row.id,
    providerId: row.provider_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * Ensures that an authenticated user has an associated Provider and OWNER membership.
 * If not present (e.g. signup trigger was delayed/skipped), provisions it seamlessly on-the-fly.
 */
export async function ensureMembershipForUser(
  supabase: SupabaseClient,
  user: User,
): Promise<ProviderMembershipWithDetails> {
  const existing = await findMembershipByUserId(supabase, user.id);
  if (existing) {
    return existing;
  }

  const displayName =
    user.user_metadata?.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "Provider";
  const providerType: ProviderType =
    user.user_metadata?.provider_type === "INDEPENDENT"
      ? "INDEPENDENT"
      : "SHOP";

  // Create base slug
  let baseSlug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!baseSlug) {
    baseSlug = "provider";
  }
  const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

  // Create provider
  const { data: providerData, error: providerError } = await supabase
    .from("providers")
    .insert({
      display_name: displayName,
      provider_type: providerType,
      slug: slug,
      contact_email: user.email,
    })
    .select("id, display_name, provider_type")
    .single();

  if (providerError) {
    throw new Error(`Failed to auto-provision provider profile: ${providerError.message}`);
  }

  // Create membership
  const membership = await createMembership(supabase, {
    providerId: providerData.id,
    userId: user.id,
    role: "OWNER",
  });

  return {
    ...membership,
    providerName: providerData.display_name,
    providerType: providerData.provider_type as ProviderType,
  };
}
