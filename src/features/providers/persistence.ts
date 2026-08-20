import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateProviderInput, Provider, ProviderType } from "./types";

export async function createProviderWithOwner(
  supabase: SupabaseClient,
  params: CreateProviderInput,
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const { data, error } = await supabase.rpc("create_provider_with_owner", {
    p_display_name: params.displayName,
    p_provider_type: params.providerType,
  });

  if (error) {
    throw new Error(`Failed to create provider: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    throw new Error("Provider creation returned empty result");
  }

  return {
    providerId: result.provider_id,
    membershipId: result.membership_id,
    slug: result.slug,
  };
}

export async function acceptStaffInvitation(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<{ providerId: string; membershipId: string; role: "STAFF" }> {
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

export async function getProviderById(
  supabase: SupabaseClient,
  providerId: string,
): Promise<Provider | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", providerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch provider: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    providerType: data.provider_type as ProviderType,
    displayName: data.display_name,
    slug: data.slug,
    description: data.description,
    profileImageUrl: data.profile_image_url,
    contactPhone: data.contact_phone,
    contactEmail: data.contact_email,
    publicAddress: data.public_address,
    serviceArea: data.service_area,
    supportedDevices: data.supported_devices ?? [],
    acceptingRequests: data.accepting_requests,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
