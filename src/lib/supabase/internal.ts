import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerConfig } from "@/lib/config/server";

// Dedicated server-only adapter for the private internal-operator records.
// Ordinary authenticated users have no access to those tables, so this seam
// uses the existing validated service credential. It must never be imported by
// client components, and it exposes only the exact internal-operation lookups
// that feature needs. The public-operation client is deliberately not widened.
export async function createInternalOperationsClient(): Promise<SupabaseClient> {
  const config = getServerConfig();

  return createSupabaseClient(
    config.supabase.url,
    config.supabase.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
