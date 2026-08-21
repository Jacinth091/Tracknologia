import { createClient } from "@/lib/supabase/server";
import { getSafeInternalRedirectUrl } from "@/lib/utils";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const safeTarget = getSafeInternalRedirectUrl(next, "/confirmed");
      return NextResponse.redirect(`${origin}${safeTarget}`);
    }
  }

  // Return to login with error if verification fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

