import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

// Client factories used by the seed and the scenarios. Public operations use
// the service-role client, mirroring src/lib/supabase/service.ts. Provider
// operations use a user client shaped like the app's SSR client.

export function createServiceClient(url, serviceRoleKey) {
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(url, anonKey, accessToken) {
  return createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function mintSupabaseJwt(userId, jwtSecret, opts = {}) {
  const role = opts.role ?? "authenticated";
  const expiresInSeconds = opts.expiresInSeconds ?? 3600;
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      role,
      aud: role,
      iss: "supabase-demo",
      iat: now,
      exp: now + expiresInSeconds,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

// Builds the `sb-<ref>-auth-token` session cookie the SSR client reads.
// The value is `base64-` + base64url(JSON.stringify(session)) exactly as
// @supabase/ssr writes it (single chunk; these sessions are small).
export function buildSsrSessionCookie(url, accessToken, user) {
  const cookieRef = new URL(url).hostname.split(".")[0];
  const session = {
    access_token: accessToken,
    refresh_token: "load-harness-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  const value = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  return {
    name: `sb-${cookieRef}-auth-token`,
    value,
  };
}
