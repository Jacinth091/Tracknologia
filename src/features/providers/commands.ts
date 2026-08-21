import "server-only";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireProviderRole } from "@/features/auth";
import {
  acceptStaffInvitation as acceptStaffInvitationPersistence,
  createProviderWithOwner,
  hashInvitationToken,
  insertStaffInvitationRecord,
  revokeStaffInvitation as revokeStaffInvitationPersistence,
} from "./persistence";
import {
  acceptStaffInvitationSchema,
  staffInvitationSchema,
} from "./schemas";
import type {
  AcceptStaffInvitationInput,
  CreateProviderInput,
  ProviderInvitation,
} from "./types";
import { sendStaffInviteEmail } from "@/lib/email/client";

/**
 * Creates a new Provider with its initial OWNER membership and person profile atomically.
 */
export async function createProvider(
  input: CreateProviderInput,
  client?: SupabaseClient,
): Promise<{ providerId: string; membershipId: string; slug: string }> {
  const supabase = client ?? (await createClient());

  return createProviderWithOwner(supabase, input);
}

export interface CreateStaffInvitationResult {
  invitation: ProviderInvitation;
  rawToken: string;
  inviteUrl: string;
  emailDeliverySuccess: boolean;
}

/**
 * Creates a secure staff invitation for a Shop Provider.
 * Generates a high-entropy raw token, persists only its SHA-256 digest,
 * and attempts email delivery.
 */
export async function createStaffInvitation(
  input: { email: string },
  client?: SupabaseClient,
): Promise<CreateStaffInvitationResult> {
  const supabase = client ?? (await createClient());

  // 1. Authorize: Caller must be OWNER of a SHOP provider
  const context = await requireProviderRole(["OWNER"], supabase);
  if (context.providerType !== "SHOP") {
    throw new Error("Staff invitations are only available for Repair Shops");
  }

  // 2. Validate input
  const parsed = staffInvitationSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email address");
  }

  // 3. Generate raw cryptographic token and SHA-256 digest
  const rawToken = `inv_${randomBytes(24).toString("hex")}`;
  const tokenHash = hashInvitationToken(rawToken);

  // 4. Persist invitation record with hashed token
  const invitation = await insertStaffInvitationRecord(supabase, {
    providerId: context.providerId,
    invitedByUserId: context.userId,
    email: parsed.data.email,
    tokenHash,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fullInviteUrl = `${appUrl}/register?invite=${rawToken}`;

  // 5. Send invitation email
  const emailResult = await sendStaffInviteEmail({
    to: invitation.email,
    shopName: context.providerName,
    inviteCode: rawToken,
    inviteUrl: fullInviteUrl,
  });

  return {
    invitation,
    rawToken,
    inviteUrl: `/register?invite=${rawToken}`,
    emailDeliverySuccess: emailResult.success,
  };
}

/**
 * Consumes a staff invitation and creates the STAFF membership and person profile atomically.
 */
export async function acceptStaffInvitation(
  input: AcceptStaffInvitationInput,
  client?: SupabaseClient,
): Promise<{ providerId: string; membershipId: string; role: "STAFF" }> {
  const supabase = client ?? (await createClient());

  const parsed = acceptStaffInvitationSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid staff invitation input");
  }

  const tokenHash = hashInvitationToken(parsed.data.token);

  return acceptStaffInvitationPersistence(
    supabase,
    tokenHash,
    parsed.data.displayName,
    parsed.data.contactPhone,
  );
}

/**
 * Revokes a pending staff invitation.
 */
export async function revokeStaffInvitation(
  invitationId: string,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = client ?? (await createClient());
  const context = await requireProviderRole(["OWNER"], supabase);

  return revokeStaffInvitationPersistence(supabase, invitationId, context.providerId);
}
