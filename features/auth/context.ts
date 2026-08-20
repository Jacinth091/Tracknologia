import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureMembershipForUser } from "./persistence";
import { AuthError, type AuthenticatedUser, type ProviderContext, type ProviderRole } from "./types";

export async function getUser(client?: SupabaseClient): Promise<AuthenticatedUser | null> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export async function requireUser(client?: SupabaseClient): Promise<AuthenticatedUser> {
  const user = await getUser(client);
  if (!user) {
    throw new AuthError("Authentication required", "UNAUTHENTICATED");
  }
  return user;
}

export async function getProviderContext(client?: SupabaseClient): Promise<ProviderContext | null> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  try {
    const membership = await ensureMembershipForUser(supabase, user);
    return {
      userId: user.id,
      providerId: membership.providerId,
      providerName: membership.providerName,
      providerType: membership.providerType,
      role: membership.role,
      email: user.email ?? null,
    };
  } catch (err) {
    console.error("[getProviderContext] Error ensuring provider membership:", err);
    return null;
  }
}

export async function requireProviderContext(client?: SupabaseClient): Promise<ProviderContext> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Authentication required", "UNAUTHENTICATED");
  }

  const membership = await ensureMembershipForUser(supabase, user);

  return {
    userId: user.id,
    providerId: membership.providerId,
    providerName: membership.providerName,
    providerType: membership.providerType,
    role: membership.role,
    email: user.email ?? null,
  };
}

export async function requireProviderRole(
  allowedRoles: ProviderRole[],
  client?: SupabaseClient,
): Promise<ProviderContext> {
  const context = await requireProviderContext(client);

  if (!allowedRoles.includes(context.role)) {
    throw new AuthError(
      `User role '${context.role}' is not authorized. Required: ${allowedRoles.join(", ")}`,
      "UNAUTHORIZED_ROLE",
    );
  }

  return context;
}
