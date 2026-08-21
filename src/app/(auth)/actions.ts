"use server";

import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginWithPassword,
  registerProviderAccount,
  requestPasswordReset,
  resetPassword,
  signOutUser,
} from "@/features/auth";
import { getSafeInternalRedirectUrl } from "@/lib/utils";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export interface ActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

async function resolveAppOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim() !== "") {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  }
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function loginAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = loginSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid login credentials",
      fieldErrors,
    };
  }

  try {
    await loginWithPassword(parsed.data);
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const redirectTo = formData.get("redirectTo")?.toString();
  const target = getSafeInternalRedirectUrl(redirectTo, "/dashboard");
  redirect(target);
}

export async function registerAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = registerSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid registration details",
      fieldErrors,
    };
  }

  const origin = await resolveAppOrigin();
  const emailRedirectTo = `${origin}/auth/callback?next=/confirmed`;

  let signUpResult;
  try {
    signUpResult = await registerProviderAccount({
      ...parsed.data,
      emailRedirectTo,
    });
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to register account",
    };
  }

  // 1. If email confirmation is disabled on Supabase, session is active immediately
  if (signUpResult.session) {
    redirect("/dashboard");
  }

  // 2. If email confirmation is disabled via dev environment toggle, auto-authenticate
  const requireEmailConfirmation = process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CONFIRMATION !== "false";
  if (!requireEmailConfirmation) {
    try {
      await loginWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      redirect("/dashboard");
    } catch {
      // If auto-signin fails (e.g. Supabase project still requires verification), show confirmation message
    }
  }

  return {
    success: "Check your email for confirmation instructions to complete your registration.",
  };
}

export async function forgotPasswordAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = forgotPasswordSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please provide a valid email address",
    };
  }

  const origin = await resolveAppOrigin();
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  try {
    await requestPasswordReset({
      email: parsed.data.email,
      redirectTo,
    });
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to request password reset",
    };
  }

  return {
    success: "Password reset link sent. Please check your email inbox.",
  };
}

export async function updatePasswordAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = resetPasswordSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid password provided",
    };
  }

  try {
    await resetPassword({ newPassword: parsed.data.password });
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to update password",
    };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  try {
    await signOutUser();
  } catch {
    // Ignore signout error and redirect
  }
  redirect("/login");
}
