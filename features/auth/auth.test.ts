import { describe, expect, it, vi } from "vitest";
import {
  getUser,
  requireUser,
  getProviderContext,
  requireProviderContext,
  requireProviderRole,
} from "./context";
import { AuthError } from "./types";
import { loginSchema, registerSchema, forgotPasswordSchema } from "./schemas";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockSupabase(options: {
  user?: { id: string; email?: string } | null;
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
  const defaultProviders = options.membership?.providers ?? {
    display_name: "Apex Electronics",
    provider_type: "SHOP",
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: options.user ? null : new Error("Not logged in"),
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "providers") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "auto-provider-id",
                  display_name: "Auto Provider",
                  provider_type: "SHOP",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: options.membership
                ? {
                    ...options.membership,
                    providers: defaultProviders,
                  }
                : null,
              error: null,
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: options.membership ?? {
                id: "new-mem-id",
                provider_id: "auto-provider-id",
                user_id: options.user?.id ?? "user-id",
                role: "OWNER",
                created_at: "2026-01-01T00:00:00Z",
              },
              error: null,
            }),
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
      },
    });

    await expect(requireProviderRole(["OWNER"], mockClient)).rejects.toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED_ROLE" }),
    );
  });
});

describe("Auth Module — Validation Schemas", () => {
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

  it("validates provider registration inputs", () => {
    const validShop = registerSchema.safeParse({
      providerType: "SHOP",
      displayName: "Apex Repair Center",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validShop.success).toBe(true);

    const validIndependent = registerSchema.safeParse({
      providerType: "INDEPENDENT",
      displayName: "Alex Mobile Tech",
      email: "alex@example.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(validIndependent.success).toBe(true);

    const mismatch = registerSchema.safeParse({
      providerType: "SHOP",
      displayName: "Apex Repair Center",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "differentpassword",
    });
    expect(mismatch.success).toBe(false);

    const shortName = registerSchema.safeParse({
      providerType: "SHOP",
      displayName: "A",
      email: "owner@example.com",
      password: "securepassword123",
      confirmPassword: "securepassword123",
    });
    expect(shortName.success).toBe(false);
  });

  it("validates forgot password inputs", () => {
    expect(forgotPasswordSchema.safeParse({ email: "valid@email.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "invalid-email" }).success).toBe(false);
  });
});
