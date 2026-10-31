import {
  createRecoveryGrantCookie,
  isRecoverySession,
  readSessionClaims,
} from "@/features/auth";
import { createClient } from "@/lib/supabase/server";
import { getSafeInternalRedirectUrl } from "@/lib/utils";
import { NextResponse } from "next/server";

/** The only `next` target the password-recovery email ever carries. */
const PASSWORD_RECOVERY_NEXT = "/reset-password";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const safeTarget = getSafeInternalRedirectUrl(next, "/confirmed");
  const isRecoveryCallback = safeTarget === PASSWORD_RECOVERY_NEXT;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (isRecoveryCallback) {
        // Purpose comes from the session this code just produced, not from
        // `next` or from user-level history. Only a recovery session (an `amr`
        // entry with method `recovery`, recent) earns a grant. Any other code
        // routed here gets no grant and the recovery error state.
        const claims = readSessionClaims(data.session?.access_token ?? "");
        const sessionId = claims?.session_id;
        if (!isRecoverySession(claims) || !sessionId) {
          return NextResponse.redirect(
            `${origin}/reset-password?callback_error=auth_callback_failed`,
          );
        }

        // The recovery code was verified and exchanged by the server. This
        // response hands the visitor their recovery grant cookie, bound to the
        // exchanged Auth user and this session, and short-lived. A browser
        // marker (`?flow=recovery`) alone can never open or submit the form.
        const grantCookie = createRecoveryGrantCookie(data.user.id, sessionId);
        const response = NextResponse.redirect(
          `${origin}/reset-password?flow=recovery`,
        );
        response.cookies.set(
          grantCookie.name,
          grantCookie.value,
          grantCookie.options,
        );
        return response;
      }
      return NextResponse.redirect(`${origin}${safeTarget}`);
    }
  }

  // A failed recovery link (expired, reused, mismatched code) must show a
  // deliberate failure even while a session already exists in this browser:
  // /reset-password is a recovery route the proxy never bounces away from,
  // unlike /login which redirects signed-in visitors back to the dashboard.
  if (isRecoveryCallback) {
    return NextResponse.redirect(
      `${origin}/reset-password?callback_error=auth_callback_failed`,
    );
  }

  // Return to login with error if verification fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
