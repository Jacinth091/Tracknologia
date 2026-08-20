import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError, type ProviderMembership, type ProviderRole, type ProviderType } from "./types";

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

/**
 * Finds the trusted Provider membership for a given user ID.
 * Returns null if 0 memberships exist.
 * Throws AMBIGUOUS_PROVIDER_CONTEXT if > 1 memberships exist (until multi-provider selection is supported).
 */
export async function findMembershipByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProviderMembershipWithDetails | null> {
  const { data, error } = await supabase
    .from("provider_memberships")
    .select("id, provider_id, user_id, role, created_at, providers!inner(display_name, provider_type)")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to fetch provider membership: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  if (data.length > 1) {
    throw new AuthError(
      "Multiple provider memberships found for user without active selection",
      "AMBIGUOUS_PROVIDER_CONTEXT",
    );
  }

  const row = data[0] as unknown as ProviderMembershipRow;
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

/**
 * Atomically provisions a new Provider and links the authenticated user as OWNER.
 * Called only during dedicated Provider Owner registration / onboarding.
 */
export async function registerProviderOwner(
  supabase: SupabaseClient,
  params: {
    displayName: string;
    providerType: ProviderType;
  },
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const { data, error } = await supabase.rpc("create_provider_with_owner", {
    p_display_name: params.displayName,
    p_provider_type: params.providerType,
  });

  if (error) {
    throw new Error(`Failed to register provider owner: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    throw new Error("Provider registration returned empty result");
  }

  return {
    providerId: result.provider_id,
    membershipId: result.membership_id,
    slug: result.slug,
  };
}

/**
 * Atomically accepts a valid, unexpired Staff invitation and creates the STAFF membership.
 */
export async function consumeStaffInvitation(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<{ providerId: string; membershipId: string; role: ProviderRole }> {
  const { data, error } = await supabase.rpc("accept_staff_invitation", {
    p_token_hash: tokenHash,
  });

  if (error) {
    throw new Error(`Failed to accept staff invitation: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    throw new Error("Staff invitation acceptance returned empty result");
  }

  return {
    providerId: result.provider_id,
    membershipId: result.membership_id,
    role: result.role,
  };
}
