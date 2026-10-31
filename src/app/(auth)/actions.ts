"use server";

import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginWithPassword,
  registerProviderAccount,
  requestPasswordReset,
  resetPassword,
  getCurrentSessionId,
  getUser,
  signOutUser,
  consumeRecoveryGrant,
  hasRecoveryGrant,
  AuthError,
} from "@/features/auth";
import { getAppOrigin, getServerConfig } from "@/lib/config/server";
import { getSafeInternalRedirectUrl } from "@/lib/utils";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export interface ActionState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

export async function loginAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = loginSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid login credentials",
      fieldErrors,
    };
  }

  try {
    await loginWithPassword(parsed.data);
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Authentication failed",
    };
  }

  const redirectTo = formData.get("redirectTo")?.toString();
  const target = getSafeInternalRedirectUrl(redirectTo, "/dashboard");
  redirect(target);
}

export async function registerAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = registerSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0].toString()] = issue.message;
      }
    });
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid registration details",
      fieldErrors,
    };
  }

  // Store temporary staff invitation token in secure httpOnly cookie (never in Auth metadata)
  if (parsed.data.intent === "STAFF" && parsed.data.inviteToken) {
    const cookieStore = await cookies();
    cookieStore.set("tracknologia_staff_invite", parsed.data.inviteToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/onboarding",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  const origin = getAppOrigin();
  const emailRedirectTo = `${origin}/auth/callback?next=/confirmed`;

  let signUpResult;
  try {
    signUpResult = await registerProviderAccount({
      ...parsed.data,
      emailRedirectTo,
    });
  } catch (err: unknown) {
    console.error("Account registration failed", err);

    const authError =
      err instanceof AuthError ||
      (err instanceof Error && err.name === "AuthError")
        ? (err as AuthError)
        : null;
    if (
      authError &&
      (authError.code === "REGISTRATION_CONFLICT" ||
        authError.code === "EMAIL_DELIVERY_FAILURE")
    ) {
      return { error: authError.message };
    }

    return {
      error:
        "Unable to create your account at this time. Please try again later.",
    };
  }

  // 1. If email confirmation is disabled on Supabase, session is active immediately
  if (signUpResult.session) {
    redirect("/dashboard");
  }

  // 2. If email confirmation is disabled via dev environment toggle, auto-authenticate
  const config = getServerConfig();
  if (!config.auth.requireEmailConfirmation) {
    try {
      await loginWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      redirect("/dashboard");
    } catch {
      // If auto-signin fails (e.g. Supabase project still requires verification), show confirmation message
    }
  }

  return {
    success:
      "Check your email for confirmation instructions to complete your registration.",
  };
}

// The provider's status and code are enough to operate the outage. Its message
// can echo the address being reset, so it is never logged.
function deliveryFailureDetails(err: unknown): {
  status?: unknown;
  code?: unknown;
} {
  const cause =
    typeof err === "object" && err !== null
      ? (err as { cause?: unknown }).cause
      : undefined;
  const source = (cause ?? err) as { status?: unknown; code?: unknown } | null;
  return { status: source?.status, code: source?.code };
}

export async function forgotPasswordAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = forgotPasswordSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Please provide a valid email address",
    };
  }

  const origin = getAppOrigin();
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

  try {
    await requestPasswordReset({
      email: parsed.data.email,
      redirectTo,
    });
  } catch (err: unknown) {
    // Delivery failures (e.g. SMTP outages) would distinguish accounts that
    // exist from unknown addresses. In production the public response stays
    // identical to a successful request; operators still see the failure in
    // server logs. In local/test runtimes a real error message aids debugging.
    if (getServerConfig().runtime === "production") {
      console.error(
        "Password reset request failed",
        deliveryFailureDetails(err),
      );
      return {
        success:
          "If an account is registered with this email, a password reset email is on its way. If you don't receive one shortly, try again later.",
      };
    }
    return {
      error:
        err instanceof Error ? err.message : "Failed to request password reset",
    };
  }

  return {
    // Neutral deliberate confirmation: never reveals whether the email is
    // registered. Supabase Auth either delivers the recovery email or
    // silently skips unknown addresses.
    success:
      "If an account is registered with this email, a password reset email is on its way. If you don't receive one shortly, try again later.",
  };
}

export async function updatePasswordAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const rawData = Object.fromEntries(formData.entries());
  const parsed = resetPasswordSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid password provided",
    };
  }

  // Fail closed on the trusted recovery context. An ordinary session is not
  // recovery authority: the visitor must carry a server-issued recovery
  // grant (created by the Auth callback after a real one-time email code
  // exchange) that also matches the signed-in Auth user. Forged
  // `?flow=recovery` markers and direct action calls fail here.
  const recoveryUser = await getUser();
  if (!recoveryUser) {
    return {
      error:
        "Your password recovery session has expired or was never established. Request a fresh password reset email and try again.",
    };
  }

  // The grant must match this user and this session, so a cookie copied from
  // another session is refused.
  const sessionId = await getCurrentSessionId();
  if (!(await hasRecoveryGrant(recoveryUser.id, sessionId))) {
    return {
      error:
        "Your password reset grant is missing or expired. Open a fresh recovery email link in this browser, then set your new password again.",
    };
  }

  try {
    await resetPassword({ newPassword: parsed.data.password });

    // Clear the grant cookie after a successful change. The grant is short-lived
    // and session-bound, not an atomic spent token: a copied cookie stays usable
    // until it expires, which is why the lifetime is ten minutes.
    await consumeRecoveryGrant();
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "Failed to update password",
    };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  try {
    await signOutUser();
  } catch {
    // Ignore signout error and redirect
  }
  redirect("/login");
}
