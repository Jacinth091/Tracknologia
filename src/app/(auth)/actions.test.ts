import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(),
  cookies: vi.fn(),
  setCookie: vi.fn(),
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
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { forgotPasswordAction, loginAction, registerAction } from "./actions";

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
  mocks.cookies.mockResolvedValue({ set: mocks.setCookie });
  mocks.createClient.mockResolvedValue({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
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
      success: "Password reset link sent. Please check your email inbox.",
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("owner@shop.com", {
      redirectTo:
        "https://tracknologia.example/auth/callback?next=/reset-password",
    });
  });
});
