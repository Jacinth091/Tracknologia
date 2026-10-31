import { createClient } from "@/lib/supabase/server";
import { getSafeInternalRedirectUrl } from "@/lib/utils";
import { NextResponse } from "next/server";

/** The only `next` target the password-recovery email ever carries. */
const PASSWORD_RECOVERY_NEXT = "/reset-password";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const safeTarget = getSafeInternalRedirectUrl(next, "/confirmed");
      // A recovery exchange has just established the password-recovery
      // session. The reset page only trusts its form when this deliberate
      // marker is present, so it never opens as a silent password change on
      // an arbitrary signed-in visit, and proxy.ts forwards signed-in
      // visitors here instead of bouncing them to the dashboard.
      if (safeTarget === PASSWORD_RECOVERY_NEXT) {
        return NextResponse.redirect(`${origin}/reset-password?flow=recovery`);
      }
      return NextResponse.redirect(`${origin}${safeTarget}`);
    }
  }

  // Return to login with error if verification fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
