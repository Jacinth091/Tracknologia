import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { GET as callbackRoute } from "./route";

const ORIGIN = "https://tracknologia.example";

function requestFor(query: string): Request {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  });
});

describe("auth callback route (#126)", () => {
  it("opens the recovery flow and sets a grant after a recent recovery request", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "owner@shop.com",
          recovery_sent_at: new Date().toISOString(),
        },
      },
      error: null,
    });

    const response = await callbackRoute(
      requestFor("?code=recovery-code&next=%2Freset-password"),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/reset-password?flow=recovery`,
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tracknologia_recovery_grant=");
    expect(setCookie).toContain("Path=/reset-password");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toContain("Max-Age=600");
  });

  it("sets no grant for a recovery-routed code without recovery_sent_at", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@shop.com" } },
      error: null,
    });

    const response = await callbackRoute(
      requestFor("?code=confirm-code&next=%2Freset-password"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/reset-password?callback_error=auth_callback_failed`,
    );
  });

  it("sets no grant when the recovery request is older than an hour", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "owner@shop.com",
          recovery_sent_at: twoHoursAgo.toISOString(),
        },
      },
      error: null,
    });

    const response = await callbackRoute(
      requestFor("?code=old-code&next=%2Freset-password"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/reset-password?callback_error=auth_callback_failed`,
    );
  });

  it("still redirects the email-confirmation exchange to /confirmed", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await callbackRoute(
      requestFor("?code=confirm-code&next=%2Fconfirmed"),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/confirmed`);
  });

  it("falls back to /confirmed for an unsafe next target", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await callbackRoute(
      requestFor("?code=code&next=https%3A%2F%2Fevil.example"),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/confirmed`);
  });

  it("recovers a failed exchange on the login page with a useful message", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: {
        message:
          "invalid request: both auth code and state should be non-empty",
      },
    });

    const response = await callbackRoute(requestFor("?code=used-code"));

    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?error=auth_callback_failed`,
    );
  });

  it("sends a code-less callback to the same login error path", async () => {
    const response = await callbackRoute(requestFor(""));

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?error=auth_callback_failed`,
    );
  });
});
