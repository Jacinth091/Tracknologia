"use server";

import { requireProviderRole } from "@/features/auth";
import {
  createStaffInvitation,
  revokeStaffInvitation,
  staffInvitationSchema,
} from "@/features/providers";
import { createClient } from "@/lib/supabase/server";
import { sendStaffInviteEmail } from "@/lib/email/client";
import { revalidatePath } from "next/cache";

export type InviteStaffState = {
  success?: string;
  error?: string;
  fieldErrors?: {
    email?: string;
  };
  token?: string;
  inviteUrl?: string;
};

export async function inviteStaffAction(
  _prevState: InviteStaffState | null,
  formData: FormData,
): Promise<InviteStaffState> {
  const supabase = await createClient();
  let context;

  try {
    // Only Owners can invite staff members
    context = await requireProviderRole(["OWNER"], supabase);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Only shop owners can invite staff",
    };
  }

  if (context.providerType !== "SHOP") {
    return {
      error: "Staff invitations are only available for Repair Shops",
    };
  }

  const rawEmail = formData.get("email");
  const parseResult = staffInvitationSchema.safeParse({ email: rawEmail });

  if (!parseResult.success) {
    return {
      fieldErrors: {
        email: parseResult.error.flatten().fieldErrors.email?.[0],
      },
    };
  }

  try {
    const { token, invitation } = await createStaffInvitation(
      supabase,
      context.providerId,
      context.userId,
      parseResult.data.email,
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const fullInviteUrl = `${appUrl}/register?invite=${token}`;

    // Send invitation email via Resend (or logs to console in dev)
    await sendStaffInviteEmail({
      to: invitation.email,
      shopName: context.providerName,
      inviteCode: token,
      inviteUrl: fullInviteUrl,
    });

    revalidatePath("/dashboard/team");

    return {
      success: `Invitation sent to ${invitation.email}`,
      token,
      inviteUrl: `/register?invite=${token}`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create staff invitation",
    };
  }
}

export async function revokeStaffAction(formData: FormData) {
  const supabase = await createClient();
  const context = await requireProviderRole(["OWNER"], supabase);
  const invitationId = formData.get("invitationId") as string;

  if (!invitationId) {
    return;
  }

  await revokeStaffInvitation(supabase, invitationId, context.providerId);
  revalidatePath("/dashboard/team");
}
