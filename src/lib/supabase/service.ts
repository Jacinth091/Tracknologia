import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerConfig } from "@/lib/config/server";

import type { SupabaseClient } from "@supabase/supabase-js";

// This client bypasses RLS. It exists solely so public, accountless
// operations cannot be invoked directly with the publishable key. Its
// documented scope is the narrow public seams: Tracking lookup, Tracking
// observation, Repair Request submission, and Feedback submission through
// `submit_feedback` only. Internal Feedback review (`record_feedback_review`)
// is not reachable from this public adapter; it belongs to the internal
// operator adapter, which supplies a server-resolved operator identity.
// Never expose it through imports reachable by client components,
// never pass its credentials into NEXT_PUBLIC_* variables, and never
// widen its usage beyond those public operation seams.
export async function createPublicOperationClient(): Promise<SupabaseClient> {
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
