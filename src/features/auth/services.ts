import "server-only";
import { createClient } from "@/lib/supabase/server";
import { registerProviderOwner, consumeStaffInvitation } from "./persistence";
import type { LoginInput, RegisterInput } from "./schemas";
import type { ProviderType } from "./types";

export async function loginWithPassword(credentials: LoginInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function registerProviderAccount(params: RegisterInput & { emailRedirectTo?: string }) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: params.emailRedirectTo,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function onboardProviderOwner(params: {
  displayName: string;
  providerType: ProviderType;
}) {
  const supabase = await createClient();
  return registerProviderOwner(supabase, params);
}

export async function acceptStaffInvite(params: { tokenHash: string }) {
  const supabase = await createClient();
  return consumeStaffInvitation(supabase, params.tokenHash);
}

export async function requestPasswordReset(params: { email: string; redirectTo?: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.resetPasswordForEmail(params.email, {
    redirectTo: params.redirectTo,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function resetPassword(params: { newPassword: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({
    password: params.newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signOutUser() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}
