import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/config/server";

/**
 * Recovery grant (issue #126 security seam).
 *
 * A browser-supplied `?flow=recovery` marker and an ordinary Auth session do
 * NOT prove that a recovery email was used, so the credential-changing
 * password action requires a server-issued recovery grant instead. The grant
 * is a signed, HttpOnly cookie created by the Auth callback route only after
 * a real one-time Supabase code exchange, bound to the exchanged Auth user,
 * expiring quickly, and consumed by the Server Action that changes the
 * password. Supabase Auth still owns the credential change itself.
 */

export const RECOVERY_GRANT_COOKIE = "tracknologia_recovery_grant";

export const RECOVERY_GRANT_TTL_SECONDS = 10 * 60;

/**
 * How old Supabase's `recovery_sent_at` may be before the callback stops
 * treating the exchanged session as a recovery. Supabase's own recovery links
 * expire on a similar scale.
 */
export const RECOVERY_REQUEST_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * True when the exchanged Auth user shows a recovery email sent recently.
 * Supabase records `recovery_sent_at` when it mails a recovery link, so this is
 * the verified purpose of the exchange. The `next` parameter never is.
 */
export function hasRecentRecoveryRequest(
  user: { recovery_sent_at?: string },
  now: number = Date.now(),
): boolean {
  if (!user.recovery_sent_at) {
    return false;
  }

  const sentAt = Date.parse(user.recovery_sent_at);
  return (
    Number.isFinite(sentAt) &&
    sentAt <= now &&
    now - sentAt <= RECOVERY_REQUEST_MAX_AGE_MS
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
 * Builds the cookie set by the Auth callback route after the recovery
 * exchange. The route owns writing it to the redirect response.
 */
export function createRecoveryGrantCookie(userId: string): {
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
  const payload = base64UrlEncode(JSON.stringify({ sub: userId, exp }));
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
 * given Auth user. Read-only: safe to call from the reset page and the
 * password action alike.
 */
export async function hasRecoveryGrant(
  userId: string | undefined,
): Promise<boolean> {
  if (!userId) {
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
    const { sub, exp } = JSON.parse(base64UrlDecode(payload)) as {
      sub: unknown;
      exp: unknown;
    };
    return (
      sub === userId && typeof exp === "number" && exp > Date.now() / 1000
    );
  } catch {
    // Malformed payloads are invalid grants; the caller fails closed.
    return false;
  }
}

/**
 * Consumes the grant after a successful password change so it cannot be
 * reused. Must be called from a Server Action (it mutates the response
 * cookies).
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
