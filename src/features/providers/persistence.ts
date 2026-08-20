import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateProviderInput,
  Provider,
  ProviderInvitation,
  ProviderType,
  TeamMember,
} from "./types";

export interface InvitationShopDetails {
  invitationId: string;
  email: string;
  role: "STAFF";
  providerId: string;
  shopName: string;
  publicAddress?: string | null;
  serviceArea?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

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

  // Update additional metadata columns if provided
  const updatePayload: Record<string, unknown> = {};
  if (params.contactEmail) updatePayload.contact_email = params.contactEmail;
  if (params.contactPhone) updatePayload.contact_phone = params.contactPhone;
  if (params.publicAddress) updatePayload.public_address = params.publicAddress;
  if (params.serviceArea) updatePayload.service_area = params.serviceArea;
  if (params.supportedDevices && params.supportedDevices.length > 0) {
    updatePayload.supported_devices = params.supportedDevices;
  }

  if (Object.keys(updatePayload).length > 0) {
    await supabase
      .from("providers")
      .update(updatePayload)
      .eq("id", result.provider_id);
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

export async function getInvitationDetailsByToken(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<InvitationShopDetails | null> {
  const { data, error } = await supabase.rpc("get_invitation_details", {
    p_token_hash: tokenHash,
  });

  if (error || !data) {
    return null;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.provider_id) {
    return null;
  }

  return {
    invitationId: result.invitation_id,
    email: result.email,
    role: result.role,
    providerId: result.provider_id,
    shopName: result.shop_name,
    publicAddress: result.public_address,
    serviceArea: result.service_area,
    contactEmail: result.contact_email,
    contactPhone: result.contact_phone,
  };
}

export async function createStaffInvitation(
  supabase: SupabaseClient,
  providerId: string,
  invitedByUserId: string,
  email: string,
): Promise<{ invitation: ProviderInvitation; token: string }> {
  const token = `inv_${crypto.randomUUID().replace(/-/g, "")}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("provider_invitations")
    .insert({
      provider_id: providerId,
      invited_by_user_id: invitedByUserId,
      email: email.toLowerCase().trim(),
      token_hash: token,
      role: "STAFF",
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create staff invitation: ${error.message}`);
  }

  return {
    token,
    invitation: {
      id: data.id,
      providerId: data.provider_id,
      email: data.email,
      role: data.role,
      tokenHash: data.token_hash,
      invitedByUserId: data.invited_by_user_id,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      acceptedAt: data.accepted_at,
      acceptedByUserId: data.accepted_by_user_id,
      revokedAt: data.revoked_at,
    },
  };
}

export async function listStaffInvitations(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderInvitation[]> {
  const { data, error } = await supabase
    .from("provider_invitations")
    .select("*")
    .eq("provider_id", providerId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list staff invitations: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    providerId: row.provider_id,
    email: row.email,
    role: row.role,
    tokenHash: row.token_hash,
    invitedByUserId: row.invited_by_user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    acceptedByUserId: row.accepted_by_user_id,
    revokedAt: row.revoked_at,
  }));
}

export async function listTeamMembers(
  supabase: SupabaseClient,
  providerId: string,
): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("provider_memberships")
    .select("id, provider_id, user_id, role, created_at")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list team members: ${error.message}`);
  }

  return (data || []).map((row) => ({
    membershipId: row.id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export async function revokeStaffInvitation(
  supabase: SupabaseClient,
  invitationId: string,
  providerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("provider_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("provider_id", providerId);

  if (error) {
    throw new Error(`Failed to revoke invitation: ${error.message}`);
  }
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
