import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // If user registered with provider owner metadata, ensure atomic onboarding is finalized
      const displayName = data.user.user_metadata?.display_name;
      const providerType = data.user.user_metadata?.provider_type;
      if (displayName && (providerType === "SHOP" || providerType === "INDEPENDENT")) {
        try {
          await supabase.rpc("create_provider_with_owner", {
            p_display_name: displayName,
            p_provider_type: providerType,
          });
        } catch {
          // If already onboarded, continue seamlessly
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return to login with error if verification fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
