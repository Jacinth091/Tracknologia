"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "./schemas";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function loginAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = loginSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  redirect("/dashboard");
}

export async function registerAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = registerSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }

  const { email, password, displayName, providerType } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        provider_type: providerType,
      },
    },
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  return {
    success: "Check your email for confirmation instructions to complete registration.",
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
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  return {
    success: "Password reset instructions have been sent to your email.",
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
      error: parsed.error.issues[0]?.message ?? "Invalid form input",
    };
  }

  const { password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return {
      error: error.message,
    };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
