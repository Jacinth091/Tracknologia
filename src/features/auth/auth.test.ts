import { describe, expect, it, vi } from "vitest";

// Mock server-only in test environment
vi.mock("server-only", () => ({}));

import {
  getUser,
  requireUser,
  getProviderContext,
  requireProviderContext,
  requireProviderRole,
} from "./context";
import { loginSchema, registerSchema, forgotPasswordSchema } from "./schemas";
import { findMembershipByUserId } from "./persistence";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockSupabase(options: {
  user?: { id: string; email?: string } | null;
  memberships?: Array<{
    id: string;
    provider_id: string;
    user_id: string;
    role: "OWNER" | "STAFF";
    created_at: string;
    providers?: {
      display_name: string;
      provider_type: "SHOP" | "INDEPENDENT";
    };
  }> | null;
  membership?: {
    id: string;
    provider_id: string;
    user_id: string;
    role: "OWNER" | "STAFF";
    created_at: string;
    providers?: {
      display_name: string;
      provider_type: "SHOP" | "INDEPENDENT";
    };
  } | null;
}) {
  const defaultProviders = {
    display_name: "Apex Electronics",
    provider_type: "SHOP" as const,
  };

  const membershipArray = options.memberships
    ? options.memberships.map((m) => ({
        ...m,
        providers: m.providers ?? defaultProviders,
      }))
    : options.membership
      ? [
          {
            ...options.membership,
            providers: options.membership.providers ?? defaultProviders,
          },
        ]
      : [];

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: options.user ? null : new Error("Not logged in"),
      }),
    },
    from: vi.fn().mockImplementation(() => {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: membershipArray,
            error: null,
          }),
        }),
      };
    }),
  } as unknown as SupabaseClient;
}

describe("Auth Module — Context & Authorization", () => {
  it("getUser returns user when authenticated", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "test@example.com" },
    });

    const user = await getUser(mockClient);
    expect(user).toEqual({
      id: "user-123",
      email: "test@example.com",
    });
  });

  it("getUser returns null when unauthenticated", async () => {
    const mockClient = createMockSupabase({ user: null });
    const user = await getUser(mockClient);
    expect(user).toBeNull();
  });

  it("requireUser throws UNAUTHENTICATED error when unauthenticated", async () => {
    const mockClient = createMockSupabase({ user: null });
    await expect(requireUser(mockClient)).rejects.toThrowError(
      expect.objectContaining({ code: "UNAUTHENTICATED" }),
    );
  });

  it("requireProviderContext FAILS CLOSED with NO_MEMBERSHIP when user has no membership", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-no-membership", email: "user@example.com" },
      membership: null,
    });

    await expect(requireProviderContext(mockClient)).rejects.toThrowError(
      expect.objectContaining({ code: "NO_MEMBERSHIP" }),
    );
  });

  it("requireProviderContext FAILS CLOSED with AMBIGUOUS_PROVIDER_CONTEXT when user has multiple memberships", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-multi", email: "multi@example.com" },
      memberships: [
        {
          id: "mem-1",
          provider_id: "prov-1",
          user_id: "user-multi",
          role: "OWNER",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "mem-2",
          provider_id: "prov-2",
          user_id: "user-multi",
          role: "STAFF",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    await expect(requireProviderContext(mockClient)).rejects.toThrowError(
      expect.objectContaining({ code: "AMBIGUOUS_PROVIDER_CONTEXT" }),
    );
  });

  it("getProviderContext returns null when user has no membership", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-no-membership", email: "user@example.com" },
      membership: null,
    });

    const context = await getProviderContext(mockClient);
    expect(context).toBeNull();
  });

  it("requireProviderContext resolves valid ProviderContext for OWNER", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "owner@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "provider-abc",
        user_id: "user-123",
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context).toEqual({
      userId: "user-123",
      providerId: "provider-abc",
      providerName: "Apex Shop",
      providerType: "SHOP",
      role: "OWNER",
      email: "owner@shop.com",
    });
  });

  it("requireProviderContext resolves valid ProviderContext for INDEPENDENT repairer", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-independent", email: "alex@mobiletech.com" },
      membership: {
        id: "mem-ind-1",
        provider_id: "provider-ind-123",
        user_id: "user-independent",
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Alex Mobile Repairs",
          provider_type: "INDEPENDENT",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context).toEqual({
      userId: "user-independent",
      providerId: "provider-ind-123",
      providerName: "Alex Mobile Repairs",
      providerType: "INDEPENDENT",
      role: "OWNER",
      email: "alex@mobiletech.com",
    });
  });

  it("requireProviderContext resolves valid ProviderContext for STAFF", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-456", email: "staff@shop.com" },
      membership: {
        id: "mem-2",
        provider_id: "provider-abc",
        user_id: "user-456",
        role: "STAFF",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderContext(mockClient);
    expect(context.role).toBe("STAFF");
    expect(context.providerId).toBe("provider-abc");
    expect(context.providerType).toBe("SHOP");
  });

  it("requireProviderRole succeeds when role matches", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-123", email: "owner@shop.com" },
      membership: {
        id: "mem-1",
        provider_id: "provider-abc",
        user_id: "user-123",
        role: "OWNER",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    const context = await requireProviderRole(["OWNER"], mockClient);
    expect(context.role).toBe("OWNER");
  });

  it("requireProviderRole throws UNAUTHORIZED_ROLE when role does not match", async () => {
    const mockClient = createMockSupabase({
      user: { id: "user-456", email: "staff@shop.com" },
      membership: {
        id: "mem-2",
        provider_id: "provider-abc",
        user_id: "user-456",
        role: "STAFF",
        created_at: "2026-01-01T00:00:00Z",
        providers: {
          display_name: "Apex Shop",
          provider_type: "SHOP",
        },
      },
    });

    await expect(requireProviderRole(["OWNER"], mockClient)).rejects.toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED_ROLE" }),
    );
  });
});

describe("Auth Module — Persistence Membership Queries", () => {
  it("findMembershipByUserId returns null when no rows exist", async () => {
    const mockClient = createMockSupabase({ membership: null });
    const result = await findMembershipByUserId(mockClient, "user-empty");
    expect(result).toBeNull();
  });
});

describe("Auth — Validation Schemas", () => {
  it("validates login inputs correctly", () => {
    const valid = loginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(valid.success).toBe(true);

    const invalidEmail = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(invalidEmail.success).toBe(false);

    const shortPassword = loginSchema.safeParse({
      email: "test@example.com",
      password: "123",
    });
    expect(shortPassword.success).toBe(false);
  });

  it("validates provider registration inputs for all intents", () => {
    const validIndependent = registerSchema.safeParse({
      intent: "INDEPENDENT",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validIndependent.success).toBe(true);

    const validShop = registerSchema.safeParse({
      intent: "SHOP",
      email: "owner@shop.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validShop.success).toBe(true);

    const validStaff = registerSchema.safeParse({
      intent: "STAFF",
      inviteToken: "valid-invite-token-123",
      email: "staff@shop.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validStaff.success).toBe(true);

    const invalidStaffMissingToken = registerSchema.safeParse({
      intent: "STAFF",
      email: "staff@shop.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(invalidStaffMissingToken.success).toBe(false);

    const mismatch = registerSchema.safeParse({
      intent: "INDEPENDENT",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "differentpassword",
    });
    expect(mismatch.success).toBe(false);
  });

  it("validates forgot password inputs", () => {
    expect(forgotPasswordSchema.safeParse({ email: "valid@email.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "invalid-email" }).success).toBe(false);
  });
});

