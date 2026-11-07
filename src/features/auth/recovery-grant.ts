import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/config/server";

/**
 * Recovery grant (issue #126 security seam).
 *
 * A browser-supplied `?flow=recovery` marker and an ordinary Auth session do
 * NOT prove that a recovery email was used. The Auth callback therefore issues
 * a grant only when the code it has just redeemed produced a recovery session:
 * the session's access-token `amr` claim names `recovery` with a recent
 * timestamp. The grant is a signed, HttpOnly cookie bound to the Auth user and
 * the session id, expiring after ten minutes. The credential-changing password
 * action accepts it only for that same user and session.
 *
 * Honest lifetime: this is a short-lived, user- and session-bound grant that
 * the browser clears after a successful change. It is NOT an atomic server-side
 * spent token. A copied cookie stays usable from the same session until it
 * expires. Supabase Auth still owns the credential change itself.
 */

export const RECOVERY_GRANT_COOKIE = "tracknologia_recovery_grant";

export const RECOVERY_GRANT_TTL_SECONDS = 10 * 60;

/**
 * How old the `amr` recovery entry may be when the callback exchanges the code.
 * A recovery link is redeemed moments after it is sent, so ten minutes is
 * generous without accepting an old session.
 */
export const RECOVERY_AMR_MAX_AGE_SECONDS = 10 * 60;

/**
 * Supabase stamps the `amr` timestamp with its own clock, while `now` is the
 * app server's. A few seconds of skew must not refuse a genuine, just-used link.
 */
export const RECOVERY_CLOCK_SKEW_MS = 60 * 1000;

/** The claims this module reads from a Supabase access token. */
export type SessionClaims = {
  session_id?: string;
  amr?: { method?: string; timestamp?: number }[];
};

/**
 * Reads the claims of an access token that Supabase has just returned to this
 * server. The token is decoded but not signature-verified: it came straight
 * from `exchangeCodeForSession` or the server session cookie, and the purpose
 * check is a decision about the response Supabase just gave us, not about a
 * token supplied by the browser. Returns null for anything malformed.
 */
export function readSessionClaims(accessToken: string): SessionClaims | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return typeof claims === "object" && claims !== null
      ? (claims as SessionClaims)
      : null;
  } catch {
    return null;
  }
}

/**
 * True when the session was produced by a recovery code: its `amr` names the
 * `recovery` method with a timestamp inside the allowed window. The `next`
 * parameter and any user-level field never prove purpose.
 */
export function isRecoverySession(
  claims: SessionClaims | null,
  nowMs: number = Date.now(),
): boolean {
  if (!claims || !Array.isArray(claims.amr)) {
    return false;
  }

  const nowSeconds = nowMs / 1000;
  const skewSeconds = RECOVERY_CLOCK_SKEW_MS / 1000;
  return claims.amr.some(
    (entry) =>
      entry?.method === "recovery" &&
      typeof entry.timestamp === "number" &&
      entry.timestamp <= nowSeconds + skewSeconds &&
      nowSeconds - entry.timestamp <= RECOVERY_AMR_MAX_AGE_SECONDS,
  );
}

/**
 * Scoped to the reset page so the grant is only ever sent where a recovery
 * session can be resolved: the reset page render, its Server Action, and
 * nowhere else.
 */
const RECOVERY_GRANT_COOKIE_PATH = "/reset-password";

// The grant key is derived from the abuse secret under its own purpose label,
// so a grant signature can never be replayed as an abuse-protection token (and
// the raw secret is never used directly as an HMAC key).
const RECOVERY_GRANT_KEY_LABEL = "tracknologia:recovery-grant:v1";

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function deriveGrantKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(RECOVERY_GRANT_KEY_LABEL).digest();
}

function signGrantPayload(payload: string, secret: string): string {
  return createHmac("sha256", deriveGrantKey(secret))
    .update(payload)
    .digest("base64url");
}

/**
 * Builds the cookie set by the Auth callback route after a recovery session
 * was confirmed. The route owns writing it to the redirect response.
 */
export function createRecoveryGrantCookie(
  userId: string,
  sessionId: string,
): {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
} {
  const config = getServerConfig();
  const exp = Math.floor(Date.now() / 1000) + RECOVERY_GRANT_TTL_SECONDS;
  const payload = base64UrlEncode(
    JSON.stringify({ sub: userId, sid: sessionId, exp }),
  );
  const signature = signGrantPayload(payload, config.publicAbuse.hmacSecret);

  return {
    name: RECOVERY_GRANT_COOKIE,
    value: `${payload}.${signature}`,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.runtime === "production",
      path: RECOVERY_GRANT_COOKIE_PATH,
      maxAge: RECOVERY_GRANT_TTL_SECONDS,
    },
  };
}

/**
 * True when the browser carries a valid, unexpired recovery grant for the
 * given Auth user AND session. Read-only: safe to call from the reset page and
 * the password action alike. A grant copied into another session is refused.
 */
export async function hasRecoveryGrant(
  userId: string | undefined,
  sessionId: string | undefined,
): Promise<boolean> {
  if (!userId || !sessionId) {
    return false;
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(RECOVERY_GRANT_COOKIE)?.value;
  if (!raw) {
    return false;
  }

  const separatorIndex = raw.lastIndexOf(".");
  if (separatorIndex === -1) {
    return false;
  }

  const payload = raw.slice(0, separatorIndex);
  const signature = raw.slice(separatorIndex + 1);
  const { publicAbuse } = getServerConfig();

  const expectedSignature = signGrantPayload(payload, publicAbuse.hmacSecret);
  const signatureMatch =
    signature.length > 0 &&
    signature.length === expectedSignature.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!signatureMatch) {
    return false;
  }

  try {
    const { sub, sid, exp } = JSON.parse(base64UrlDecode(payload)) as {
      sub: unknown;
      sid: unknown;
      exp: unknown;
    };
    return (
      sub === userId &&
      sid === sessionId &&
      typeof exp === "number" &&
      exp > Date.now() / 1000
    );
  } catch {
    // Malformed payloads are invalid grants; the caller fails closed.
    return false;
  }
}

/**
 * Clears the grant cookie after a successful password change, so the browser
 * stops sending it. This is a browser instruction, not an atomic server-side
 * spend. It must be called from a Server Action (it mutates response cookies).
 */
export async function consumeRecoveryGrant(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_GRANT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getServerConfig().runtime === "production",
    path: RECOVERY_GRANT_COOKIE_PATH,
    maxAge: 0,
  });
}
