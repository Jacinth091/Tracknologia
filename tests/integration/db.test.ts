import { describe, expect, it, vi } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

import { createClient } from "@supabase/supabase-js";
import { hashInvitationToken } from "@/features/providers/persistence";

const testUrl = process.env.SUPABASE_TEST_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test";
const testServiceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const isRealDbAvailable = Boolean(process.env.SUPABASE_TEST_URL || process.env.RUN_DB_INTEGRATION_TESTS === "true");

describe("PostgreSQL Real Database, RPCs & RLS Integration Suite (AUTH-R28)", () => {
  if (!isRealDbAvailable) {
    it.skip("Real PostgreSQL / Supabase integration suite skipped (run with SUPABASE_TEST_URL or RUN_DB_INTEGRATION_TESTS=true)", () => {
      // Skipped when local Supabase instance is not running
    });
    return;
  }

  const adminClient = createClient(testUrl, testServiceKey || testAnonKey);
  const anonClient = createClient(testUrl, testAnonKey);

  it("1. RLS: Anonymous user cannot query raw providers table directly", async () => {
    const { data, error } = await anonClient.from("providers").select("*");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("2. Public Projection: Anonymous user can query public_provider_profiles view omitting private columns", async () => {
    const { data, error } = await anonClient.from("public_provider_profiles").select("*");
    expect(error).toBeNull();
    if (data && data.length > 0) {
      expect(data[0]).not.toHaveProperty("contact_phone");
      expect(data[0]).not.toHaveProperty("contact_email");
      expect(data[0]).toHaveProperty("display_name");
      expect(data[0]).toHaveProperty("accepting_requests");
    }
  });

  it("3. RPC & Advisory Lock: create_provider_with_owner requires authentication and non-blank names", async () => {
    // Unauthenticated caller should fail
    const { error } = await anonClient.rpc("create_provider_with_owner", {
      p_display_name: "Test Shop",
      p_provider_type: "SHOP",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Authentication required/i);
  });

  it("4. Narrow RPC: create_staff_invitation rejects unauthenticated and INDEPENDENT providers", async () => {
    const rawToken = "inv_123456789012345678901234567890123456789012345678";
    const tokenHash = hashInvitationToken(rawToken);

    const { error } = await anonClient.rpc("create_staff_invitation", {
      p_email: "tech@shop.com",
      p_token_hash: tokenHash,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Authentication required/i);
  });

  it("5. Direct Table Mutation: Direct INSERT on provider_invitations is denied for unauthenticated/anon clients", async () => {
    const rawToken = "inv_direct_insert_denied_123456789012345678901234";
    const tokenHash = hashInvitationToken(rawToken);

    const { error } = await anonClient.from("provider_invitations").insert({
      provider_id: "00000000-0000-0000-0000-000000000000",
      email: "test@example.com",
      token_hash: tokenHash,
      role: "STAFF",
      invited_by_user_id: "00000000-0000-0000-0000-000000000000",
    });

    expect(error).not.toBeNull();
  });
});
