import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findMembershipByUserId } from "./persistence";
import {
  AuthError,
  type AuthenticatedUser,
  type ProviderContext,
  type ProviderRole,
} from "./types";

export async function getUser(
  client?: SupabaseClient,
): Promise<AuthenticatedUser | null> {
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
    userMetadata: user.user_metadata,
  };
}

export async function requireUser(
  client?: SupabaseClient,
): Promise<AuthenticatedUser> {
  const user = await getUser(client);
  if (!user) {
    throw new AuthError("Authentication required", "UNAUTHENTICATED");
  }
  return user;
}

export async function getProviderContext(
  client?: SupabaseClient,
): Promise<ProviderContext | null> {
  const supabase = client ?? (await createClient());
  const user = await getUser(supabase);

  if (!user) {
    return null;
  }

  const membership = await findMembershipByUserId(supabase, user.id);
  if (!membership) {
    return null;
  }

  return {
    userId: user.id,
    providerId: membership.providerId,
    providerName: membership.providerName,
    providerType: membership.providerType,
    role: membership.role,
    email: user.email,
  };
}

/**
 * Resolves the trusted ProviderContext for the authenticated user.
 * FAILS CLOSED: Throws AuthError('NO_MEMBERSHIP') if the user has no active Provider membership.
 */
export async function requireProviderContext(
  client?: SupabaseClient,
): Promise<ProviderContext> {
  const supabase = client ?? (await createClient());
  const user = await requireUser(supabase);

  const membership = await findMembershipByUserId(supabase, user.id);
  if (!membership) {
    throw new AuthError(
      "No provider membership found for user",
      "NO_MEMBERSHIP",
    );
  }

  return {
    userId: user.id,
    providerId: membership.providerId,
    providerName: membership.providerName,
    providerType: membership.providerType,
    role: membership.role,
    email: user.email,
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
