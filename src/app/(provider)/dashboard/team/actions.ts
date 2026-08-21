"use server";

import {
  createStaffInvitation,
  revokeStaffInvitation,
} from "@/features/providers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type InviteStaffState = {
  success?: string;
  error?: string;
  fieldErrors?: {
    email?: string;
  };
  token?: string;
  inviteUrl?: string;
  emailDeliveryFailed?: boolean;
};

export async function inviteStaffAction(
  _prevState: InviteStaffState | null,
  formData: FormData,
): Promise<InviteStaffState> {
  const supabase = await createClient();
  const rawEmail = formData.get("email")?.toString() ?? "";

  try {
    const result = await createStaffInvitation({ email: rawEmail }, supabase);

    revalidatePath("/dashboard/team");

    if (!result.emailDeliverySuccess) {
      return {
        success: `Invitation created for ${result.invitation.email}, but email delivery failed. You can copy and share the invitation link below.`,
        token: result.rawToken,
        inviteUrl: result.inviteUrl,
        emailDeliveryFailed: true,
      };
    }

    return {
      success: `Invitation sent to ${result.invitation.email}`,
      token: result.rawToken,
      inviteUrl: result.inviteUrl,
      emailDeliveryFailed: false,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create staff invitation",
    };
  }
}

export async function revokeStaffAction(
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient();
  const invitationId = formData.get("invitationId") as string;

  if (!invitationId) {
    return { error: "Invitation ID is required" };
  }

  try {
    await revokeStaffInvitation(invitationId, supabase);
    revalidatePath("/dashboard/team");
    return { success: "Invitation revoked" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to revoke invitation",
    };
  }
}

