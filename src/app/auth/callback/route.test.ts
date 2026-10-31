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

/** An access token shaped like Supabase's; the route reads only the payload. */
function sessionWith(claims: Record<string, unknown>) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.sig`,
  };
}

function nowSeconds(offsetSeconds = 0): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

/** The exchange returns a session whose `amr` names how it was produced. */
function exchangeReturns(
  claims: Record<string, unknown>,
  user: Record<string, unknown> = { id: "user-1", email: "owner@shop.com" },
) {
  mocks.exchangeCodeForSession.mockResolvedValue({
    data: { user, session: sessionWith(claims) },
    error: null,
  });
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
  it("sets a grant only when the redeemed session is a recent recovery", async () => {
    exchangeReturns({
      session_id: "sess-1",
      amr: [{ method: "recovery", timestamp: nowSeconds() }],
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

  it("sets no grant for a valid non-recovery code, even with a recent recovery request", async () => {
    // The user's own recovery timestamp is recent, so only the session's amr
    // can tell that this code is not a recovery.
    exchangeReturns(
      {
        session_id: "sess-1",
        amr: [{ method: "magiclink", timestamp: nowSeconds() }],
      },
      {
        id: "user-1",
        email: "owner@shop.com",
        recovery_sent_at: new Date().toISOString(),
      },
    );

    const response = await callbackRoute(
      requestFor("?code=magic-code&next=%2Freset-password"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/reset-password?callback_error=auth_callback_failed`,
    );
  });

  it("sets no grant for a password or OTP session routed to recovery", async () => {
    for (const method of ["password", "otp"]) {
      exchangeReturns({
        session_id: "sess-1",
        amr: [{ method, timestamp: nowSeconds() }],
      });

      const response = await callbackRoute(
        requestFor("?code=other-code&next=%2Freset-password"),
      );

      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("sets no grant when the recovery amr entry is older than the window", async () => {
    exchangeReturns({
      session_id: "sess-1",
      amr: [{ method: "recovery", timestamp: nowSeconds(-2 * 60 * 60) }],
    });

    const response = await callbackRoute(
      requestFor("?code=old-code&next=%2Freset-password"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/reset-password?callback_error=auth_callback_failed`,
    );
  });

  it("sets no grant when the session carries no session id to bind to", async () => {
    exchangeReturns({
      amr: [{ method: "recovery", timestamp: nowSeconds() }],
    });

    const response = await callbackRoute(
      requestFor("?code=no-sid-code&next=%2Freset-password"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
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
