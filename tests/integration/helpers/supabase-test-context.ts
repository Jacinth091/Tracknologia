import {
  createClient,
  type SupabaseClient,
  type Session,
  type User,
} from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const testUrl =
  process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const testAnonKey =
  process.env.SUPABASE_TEST_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";
export const testServiceKey =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

export function requireDbConfig(): void {
  const missing = [
    ["SUPABASE_TEST_URL or NEXT_PUBLIC_SUPABASE_URL", testUrl],
    [
      "SUPABASE_TEST_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      testAnonKey,
    ],
    [
      "SUPABASE_TEST_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY",
      testServiceKey,
    ],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing real DB integration configuration: ${missing.map(([name]) => name).join(", ")}`,
    );
  }
}

export function createAdminClient(): SupabaseClient {
  requireDbConfig();
  return createClient(testUrl, testServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAnonClient(): SupabaseClient {
  requireDbConfig();
  return createClient(testUrl, testAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createAuthenticatedClient(session: Session): SupabaseClient {
  requireDbConfig();
  return createClient(testUrl, testAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  });
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID()}@example.test`;
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${randomUUID()}`;
}

export async function createTestUser(
  adminClient: SupabaseClient,
  email = uniqueEmail("user"),
  password = "TestPassword123!",
): Promise<{ user: User; email: string; password: string }> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(
      `Failed to create test user: ${error?.message ?? "missing user"}`,
    );
  }

  return { user: data.user, email, password };
}

export async function signInTestUser(
  email: string,
  password: string,
): Promise<{ session: Session; client: SupabaseClient }> {
  const signInClient = createAnonClient();
  const { data, error } = await signInClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to sign in test user: ${error?.message ?? "missing session"}`,
    );
  }

  return {
    session: data.session,
    client: createAuthenticatedClient(data.session),
  };
}

export async function cleanupFixture(
  adminClient: SupabaseClient,
  params: { userIds?: string[]; providerIds?: string[] },
): Promise<void> {
  if (params.providerIds && params.providerIds.length > 0) {
    await adminClient.from("providers").delete().in("id", params.providerIds);
  }

  if (params.userIds) {
    await Promise.all(
      params.userIds.map(async (userId) => {
        await adminClient.auth.admin.deleteUser(userId);
      }),
    );
  }
}
