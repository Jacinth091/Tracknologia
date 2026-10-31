import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  getAuthUser: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  cookies: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getCookie: vi.fn(),
  consoleError: vi.spyOn(console, "error").mockImplementation(() => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/config/server", () => ({
  getAppOrigin: () => "https://tracknologia.example",
  getServerConfig: () => ({
    runtime: "production",
    auth: { requireEmailConfirmation: true },
    publicAbuse: { hmacSecret: "test_recovery_grant_secret_32_chars_long" },
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  updatePasswordAction,
} from "./actions";
import {
  createRecoveryGrantCookie,
  RECOVERY_GRANT_COOKIE,
} from "@/features/auth";

function registerFormData() {
  const formData = new FormData();
  formData.set("intent", "SHOP");
  formData.set("email", "owner@shop.com");
  formData.set("password", "password123");
  formData.set("confirmPassword", "password123");
  return formData;
}

function loginFormData(redirectTo?: string) {
  const formData = new FormData();
  formData.set("email", "owner@shop.com");
  formData.set("password", "password123");
  if (redirectTo !== undefined) {
    formData.set("redirectTo", redirectTo);
  }
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue({
    set: mocks.setCookie,
    get: mocks.getCookie,
    delete: mocks.deleteCookie,
  });
  mocks.getCookie.mockReturnValue(undefined);
  mocks.createClient.mockResolvedValue({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      updateUser: mocks.updateUser,
      getUser: mocks.getAuthUser,
    },
  });
});

describe("loginAction", () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  });

  it("returns the user to a valid local target", async () => {
    await loginAction(null, loginFormData("/internal/queue?tab=open"));

    expect(mocks.redirect).toHaveBeenCalledWith("/internal/queue?tab=open");
  });

  it("falls back to the dashboard when no target is posted", async () => {
    await loginAction(null, loginFormData());

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("falls back for a forged external target", async () => {
    await loginAction(null, loginFormData("https://evil.example/internal"));

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("falls back for protocol-relative and backslash targets", async () => {
    await loginAction(null, loginFormData("//evil.example"));
    expect(mocks.redirect).toHaveBeenLastCalledWith("/dashboard");

    await loginAction(null, loginFormData("/\\evil.example"));
    expect(mocks.redirect).toHaveBeenLastCalledWith("/dashboard");
  });
});

describe("registerAction", () => {
  it("creates a Staff login without requiring an invitation code at signup", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "staff-1" }, session: null },
      error: null,
    });
    const form = registerFormData();
    form.set("intent", "STAFF");

    const result = await registerAction(null, form);

    expect(result.error).toBeUndefined();
    expect(result.success).toBeDefined();
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { intent: "STAFF", provider_type: undefined },
        }),
      }),
    );
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });

  it("carries a shared-link invitation to onboarding without putting it in Auth metadata", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "staff-1" }, session: null },
      error: null,
    });
    const form = registerFormData();
    form.set("intent", "STAFF");
    const token = `inv_${"a".repeat(48)}`;
    form.set("inviteToken", token);

    await registerAction(null, form);

    expect(mocks.setCookie).toHaveBeenCalledWith(
      "tracknologia_staff_invite",
      token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/onboarding",
      }),
    );
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { intent: "STAFF", provider_type: undefined },
        }),
      }),
    );
  });

  it("does not expose an unknown production Supabase sentinel", async () => {
    const sentinel = "SUPABASE_SIGNUP_SENTINEL_f829";
    mocks.signUp.mockResolvedValue({
      data: null,
      error: { message: sentinel, status: 503, code: "unexpected_failure" },
    });

    const result = await registerAction(null, registerFormData());

    expect(result).toEqual({
      error:
        "Unable to create your account at this time. Please try again later.",
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(mocks.consoleError).toHaveBeenCalledWith(
      "Supabase registration failed",
      expect.objectContaining({ message: sentinel }),
    );
  });

  it("preserves the deliberate existing-account distinction", async () => {
    mocks.signUp.mockResolvedValue({
      data: null,
      error: {
        message: "dependency-specific duplicate text",
        status: 422,
        code: "user_already_exists",
      },
    });

    const result = await registerAction(null, registerFormData());

    expect(result).toEqual({
      error: "An account already exists for this email address.",
    });
  });
});

describe("forgotPasswordAction", () => {
  it("uses exactly the configured production origin for the callback", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const formData = new FormData();
    formData.set("email", "owner@shop.com");

    const result = await forgotPasswordAction(null, formData);

    expect(result).toEqual({
      success:
        "If an account is registered with this email, a password reset email is on its way. If you don't receive one shortly, try again later.",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("owner@shop.com", {
      redirectTo:
        "https://tracknologia.example/auth/callback?next=/reset-password",
    });
  });

  it("keeps a production delivery failure neutral about account existence", async () => {
    const sentinel = "SMTP_RESET_SENTINEL_74b1";
    mocks.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: sentinel, status: 500 },
    });
    const formData = new FormData();
    formData.set("email", "owner@shop.com");

    const result = await forgotPasswordAction(null, formData);

    // Identical response for unknown/known addresses and delivery
    // failures; operators observe the failure through server logs only.
    expect(result).toEqual({
      success:
        "If an account is registered with this email, a password reset email is on its way. If you don't receive one shortly, try again later.",
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    // The log carries the provider's status, never its message.
    expect(mocks.consoleError).toHaveBeenCalledWith(
      "Password reset request failed",
      expect.objectContaining({ status: 500 }),
    );
    expect(JSON.stringify(mocks.consoleError.mock.calls)).not.toContain(
      sentinel,
    );
  });
});

describe("updatePasswordAction", () => {
  function resetFormData(password = "newPassw0rd", confirm?: string) {
    const formData = new FormData();
    formData.set("password", password);
    formData.set("confirmPassword", confirm ?? password);
    return formData;
  }

  function grantRecoverySession(userId: string) {
    const cookie = createRecoveryGrantCookie(userId);
    mocks.getCookie.mockImplementation(
      (name: string) =>
        (name === RECOVERY_GRANT_COOKIE
          ? { value: cookie.value }
          : undefined) ?? undefined,
    );
    return cookie;
  }

  it("sends the new password to Supabase Auth for the recovery session user", async () => {
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@shop.com" } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
    const grant = grantRecoverySession("user-1");

    await updatePasswordAction(null, resetFormData());

    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "newPassw0rd",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.setCookie).toHaveBeenCalledWith(
      RECOVERY_GRANT_COOKIE,
      "",
      expect.objectContaining({ path: "/reset-password", maxAge: 0 }),
    );
    // Consuming the grant must not weaken the cookie contract.
    expect(grant.options.httpOnly).toBe(true);
    expect(grant.options.sameSite).toBe("lax");
  });

  it("fails closed before touching Auth when no recovery session exists", async () => {
    mocks.getAuthUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
      },
    });

    const result = await updatePasswordAction(null, resetFormData());

    expect(result).toEqual({
      error:
        "Your password recovery session has expired or was never established. Request a fresh password reset email and try again.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses an ordinary signed-in session that carries no recovery grant", async () => {
    // An forged `?flow=recovery` marker plus a valid session is not
    // recovery authority: the server-issued grant cookie is required.
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@shop.com" } },
      error: null,
    });

    const result = await updatePasswordAction(null, resetFormData());

    expect(result).toEqual({
      error:
        "Your password reset grant is missing or expired. Open a fresh recovery email link in this browser, then set your new password again.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not spend a grant belonging to a different account", async () => {
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: "user-2", email: "other@shop.com" } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ data: {}, error: null });
    grantRecoverySession("user-1");

    const result = await updatePasswordAction(null, resetFormData());

    expect(result.error).toContain("grant is missing or expired");
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation fields", async () => {
    const result = await updatePasswordAction(
      null,
      resetFormData("newPassw0rd", "differentPassw0rd"),
    );

    expect(result).toEqual({ error: "Passwords do not match" });
    expect(mocks.getAuthUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("does not expose a raw production Auth failure", async () => {
    const sentinel = "AUTH_UPDATE_SENTINEL_99c2";
    mocks.getAuthUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "owner@shop.com" } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({
      data: {},
      error: { message: sentinel, status: 500 },
    });
    // The grant check runs first, so this test needs a valid grant to reach
    // the Auth failure it is about.
    grantRecoverySession("user-1");

    const result = await updatePasswordAction(null, resetFormData());

    expect(result).toEqual({
      error:
        "Unable to set your password right now. Request a fresh password reset email and try again.",
    });
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });
});
