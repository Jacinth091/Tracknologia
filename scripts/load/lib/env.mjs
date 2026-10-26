// Environment resolution for the load harness. Mirrors the integration test
// contract (tests/integration/helpers/supabase-test-context.ts) so the same
// shell environment drives both.

export function resolveEnv() {
  const url =
    process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  const jwtSecret =
    process.env.SUPABASE_TEST_JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "";
  const appUrl =
    process.env.LOAD_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  const missing = [
    ["SUPABASE_TEST_URL or NEXT_PUBLIC_SUPABASE_URL", url],
    [
      "SUPABASE_TEST_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY",
      serviceRoleKey,
    ],
    ["SUPABASE_TEST_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", anonKey],
    [
      "SUPABASE_TEST_JWT_SECRET or SUPABASE_JWT_SECRET or JWT_SECRET",
      jwtSecret,
    ],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing load-harness config: ${missing.map(([name]) => name).join(", ")}`,
    );
  }

  return { url, anonKey, serviceRoleKey, jwtSecret, appUrl };
}
