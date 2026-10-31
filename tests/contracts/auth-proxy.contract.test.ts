import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock @supabase/ssr
const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

import { proxy } from "../../proxy";

describe("Proxy & Route Protection Contract (AUTH-R18, AUTH-R20)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Public Accountless Route Auth Bypass (PERF-01 / REQ-01)", () => {
    it("bypasses Supabase getUser call on public tracking route /track", async () => {
      const request = new NextRequest("https://tracknologia.com/track");
      const response = await proxy(request);

      expect(response).toBeDefined();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("bypasses Supabase getUser call on public request intake route /p/shop/request", async () => {
      const request = new NextRequest(
        "https://tracknologia.com/p/shop-slug/request",
      );
      const response = await proxy(request);

      expect(response).toBeDefined();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("bypasses Supabase getUser call on root landing page /", async () => {
      const request = new NextRequest("https://tracknologia.com/");
      const response = await proxy(request);

      expect(response).toBeDefined();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("bypasses Supabase getUser call on /confirmed", async () => {
      const request = new NextRequest("https://tracknologia.com/confirmed");
      const response = await proxy(request);

      expect(response).toBeDefined();
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  describe("Protected Route Enforcement", () => {
    it("redirects unauthenticated users from /dashboard to /login", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: "AuthSessionMissingError",
          message: "Auth session missing!",
        },
      });

      const request = new NextRequest("https://tracknologia.com/dashboard");
      const response = await proxy(request);

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/login?redirectTo=%2Fdashboard",
      );
    });

    it("preserves session and DOES NOT redirect /dashboard during Supabase infrastructure failure (500)", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: "AuthRetryableFetchError",
          status: 500,
          message: "Internal Server Error",
        },
      });

      const request = new NextRequest("https://tracknologia.com/dashboard");
      const response = await proxy(request);

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      // Must NOT redirect to /login
      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  describe("Internal route coarse protection", () => {
    it("returns unauthenticated /internal visitors to login", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: "AuthSessionMissingError",
          message: "Auth session missing!",
        },
      });

      const request = new NextRequest("https://tracknologia.com/internal");
      const response = await proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/login?redirectTo=%2Finternal",
      );
    });

    it("preserves the login return path and query", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: "AuthSessionMissingError",
          message: "Auth session missing!",
        },
      });

      const request = new NextRequest(
        "https://tracknologia.com/internal/queue?tab=open",
      );
      const response = await proxy(request);

      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/login?redirectTo=%2Finternal%2Fqueue%3Ftab%3Dopen",
      );
    });

    it("treats /internally as a public route", async () => {
      const request = new NextRequest("https://tracknologia.com/internally");

      await proxy(request);

      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("does not redirect /internal during an auth outage", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: {
          name: "AuthRetryableFetchError",
          status: 500,
          message: "Internal Server Error",
        },
      });

      const request = new NextRequest("https://tracknologia.com/internal");
      const response = await proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  describe("Auth Entry Route Redirection", () => {
    it("redirects authenticated users from /login to /dashboard", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest("https://tracknologia.com/login");
      const response = await proxy(request);

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/dashboard",
      );
    });

    it("honors a safe internal destination", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest(
        "https://tracknologia.com/login?redirectTo=%2Finternal",
      );
      const response = await proxy(request);

      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/internal",
      );
    });

    it("keeps a destination query string as a query string", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest(
        "https://tracknologia.com/login?redirectTo=%2Finternal%3Ftab%3Drepairs",
      );
      const response = await proxy(request);

      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/internal?tab=repairs",
      );
    });

    it("falls back to /dashboard for unsafe destinations", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const unsafeTargets = [
        "https%3A%2F%2Fevil.example",
        "%2F%2Fevil.example",
        "%2F%5Cevil.example",
      ];

      for (const target of unsafeTargets) {
        const request = new NextRequest(
          `https://tracknologia.com/login?redirectTo=${target}`,
        );
        const response = await proxy(request);

        expect(response.headers.get("location")).toBe(
          "https://tracknologia.com/dashboard",
        );
      }
    });

    it("does not leak the login query into the destination", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest(
        "https://tracknologia.com/login?redirectTo=%2Finternal&next=%2Fregister",
      );
      const response = await proxy(request);

      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/internal",
      );
    });
  });

  describe("Password recovery routing (#126)", () => {
    const unauthenticated = {
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
      },
    };

    it("lets a signed-in recovery session reach /reset-password instead of bouncing to the dashboard", async () => {
      // A recovery exchange establishes a session; redirecting authenticated
      // visitors away here used to strand the password form behind the
      // dashboard.
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest(
        "https://tracknologia.com/reset-password?flow=recovery",
      );
      const response = await proxy(request);

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    });

    it("sends an unauthenticated /reset-password visit to the page's own recovery state, not /login", async () => {
      mockGetUser.mockResolvedValue(unauthenticated);

      const request = new NextRequest(
        "https://tracknologia.com/reset-password",
      );
      const response = await proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    });

    it("keeps /forgot-password reachable for signed-in account holders", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest(
        "https://tracknologia.com/forgot-password",
      );
      const response = await proxy(request);

      expect(response.status).not.toBe(307);
      expect(response.headers.get("location")).toBeNull();
    });

    it("still redirects signed-in users away from /login", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      const request = new NextRequest("https://tracknologia.com/login");
      const response = await proxy(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://tracknologia.com/dashboard",
      );
    });
  });
});
