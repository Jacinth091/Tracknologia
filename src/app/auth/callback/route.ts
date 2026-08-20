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
      const inviteToken = data.user.user_metadata?.invite_token;
      // If user registered with a staff invite token, accept it automatically
      if (inviteToken) {
        try {
          await supabase.rpc("accept_staff_invitation", {
            p_token_hash: inviteToken,
          });
        } catch {
          // If token fails or expired, user will be redirected to onboarding to view/fix it
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return to login with error if verification fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
