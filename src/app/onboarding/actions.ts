"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createIndependentProviderSchema,
  createShopProviderSchema,
  createProviderWithOwner,
  acceptStaffInvitation,
} from "@/features/providers";
import { redirect } from "next/navigation";

export interface OnboardingActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export async function onboardIndependentAction(
  _prevState: OnboardingActionState | null,
  formData: FormData,
): Promise<OnboardingActionState> {
  const supabase = await createClient();
  const rawData = {
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
    await createProviderWithOwner(supabase, {
      ...parsed.data,
      providerType: "INDEPENDENT",
    });
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
  const rawData = {
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
    await createProviderWithOwner(supabase, {
      ...parsed.data,
      providerType: "SHOP",
    });
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
  const token = formData.get("token")?.toString()?.trim();

  if (!token) {
    return {
      error: "Please enter your invitation code or token",
    };
  }

  try {
    await acceptStaffInvitation(supabase, token);
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Invalid, expired, or revoked invitation",
    };
  }

  redirect("/dashboard");
}
