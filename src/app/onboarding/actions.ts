"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createIndependentProviderSchema,
  createShopProviderSchema,
  acceptStaffInvitationSchema,
  createProvider,
  acceptStaffInvitation,
} from "@/features/providers";
import { redirect } from "next/navigation";

export interface OnboardingActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

import { cookies } from "next/headers";

export async function onboardIndependentAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const ownerContactPhone = formData.get("ownerContactPhone")?.toString() || undefined;
  const rawData = {
    ownerName: formData.get("ownerName")?.toString() ?? "",
    displayName: formData.get("displayName")?.toString() ?? "",
    contactEmail: formData.get("contactEmail")?.toString() || undefined,
    contactPhone: formData.get("contactPhone")?.toString() || undefined,
    serviceArea: formData.get("serviceArea")?.toString() || undefined,
    supportedDevices: formData.getAll("supportedDevices").map((d) => d.toString()),
  };

  const parsed = createIndependentProviderSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid independent provider details",
      fieldErrors,
    };
  }

  try {
    await createProvider(
      {
        displayName: parsed.data.displayName,
        providerType: "INDEPENDENT",
        ownerDisplayName: parsed.data.ownerName,
        ownerContactPhone: ownerContactPhone,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        serviceArea: parsed.data.serviceArea,
        supportedDevices: parsed.data.supportedDevices,
      },
      supabase,
    );
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to create independent provider",
    };
  }

  redirect("/dashboard");
}

export async function onboardShopAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const ownerContactPhone = formData.get("ownerContactPhone")?.toString() || undefined;
  const rawData = {
    ownerName: formData.get("ownerName")?.toString() ?? "",
    displayName: formData.get("displayName")?.toString() ?? "",
    contactEmail: formData.get("contactEmail")?.toString() || undefined,
    contactPhone: formData.get("contactPhone")?.toString() || undefined,
    publicAddress: formData.get("publicAddress")?.toString() || undefined,
    serviceArea: formData.get("serviceArea")?.toString() || undefined,
    supportedDevices: formData.getAll("supportedDevices").map((d) => d.toString()),
  };

  const parsed = createShopProviderSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid shop provider details",
      fieldErrors,
    };
  }

  try {
    await createProvider(
      {
        displayName: parsed.data.displayName,
        providerType: "SHOP",
        ownerDisplayName: parsed.data.ownerName,
        ownerContactPhone: ownerContactPhone,
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        publicAddress: parsed.data.publicAddress,
        serviceArea: parsed.data.serviceArea,
        supportedDevices: parsed.data.supportedDevices,
      },
      supabase,
    );
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to create repair shop",
    };
  }

  redirect("/dashboard");
}

export async function acceptStaffInviteAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const token = formData.get("token")?.toString()?.trim() ?? "";
  const fullName = formData.get("fullName")?.toString()?.trim() ?? "";
  const contactPhone = formData.get("contactPhone")?.toString()?.trim();

  const parsed = acceptStaffInvitationSchema.safeParse({
    token,
    displayName: fullName,
    contactPhone: contactPhone || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0] === "displayName" ? "fullName" : issue.path[0]?.toString();
      if (key) {
        fieldErrors[key] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid invitation details",
      fieldErrors,
    };
  }

  try {
    await acceptStaffInvitation(
      {
        token: parsed.data.token,
        displayName: parsed.data.displayName,
        contactPhone: parsed.data.contactPhone,
      },
      supabase,
    );
    const cookieStore = await cookies();
    cookieStore.delete("tracknologia_staff_invite");
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Invalid, expired, or already accepted invitation",
    };
  }

  redirect("/dashboard");
}

