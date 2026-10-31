import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked: the auth seam and framework navigation. The page's own recovery
// state resolution runs for real.
const feature = vi.hoisted(() => ({
  getUser: vi.fn(),
  hasRecoveryGrant: vi.fn(),
  getCurrentSessionId: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

// The pure masking helper runs for real; the grant and session seams are mocked.
vi.mock("@/features/auth", async () => ({
  ...feature,
  maskEmail: (await import("@/features/auth/mask-email")).maskEmail,
}));

vi.mock("next/navigation", () => navigation);

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("../_components/reset-password-form", () => ({
  ResetPasswordForm: () => <form aria-label="reset password form" />,
}));

import ResetPasswordPage from "./page";

function openResetPage(searchParams: { flow?: string } = {}) {
  return ResetPasswordPage({ searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  vi.clearAllMocks();
  feature.getUser.mockResolvedValue(null);
  feature.hasRecoveryGrant.mockResolvedValue(false);
  feature.getCurrentSessionId.mockResolvedValue("sess-1");
});

describe("reset password page states (#126)", () => {
  it("shows the recovery-link state for an unauthenticated visitor", async () => {
    const html = renderToStaticMarkup(await openResetPage());

    expect(html).toContain("Recovery link required");
    expect(html).toContain("/forgot-password");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("shows the password form after the recovery exchange, naming the account by masked email", async () => {
    feature.getUser.mockResolvedValue({
      id: "user-1",
      email: "owner@shop.com",
    });
    feature.hasRecoveryGrant.mockResolvedValue(true);

    const html = renderToStaticMarkup(
      await openResetPage({ flow: "recovery" }),
    );

    expect(html).toContain("Set New Password");
    expect(html).toContain("reset password form");
    expect(html).toContain("Setting a new password for");
    expect(html).toContain("o•••@shop.com");
    expect(html).not.toContain("owner@shop.com");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("shows the fresh-link card, not the form, when the grant is missing or expired", async () => {
    feature.getUser.mockResolvedValue({
      id: "user-1",
      email: "owner@shop.com",
    });
    feature.hasRecoveryGrant.mockResolvedValue(false);

    const html = renderToStaticMarkup(
      await openResetPage({ flow: "recovery" }),
    );

    expect(html).toContain("Recovery link required");
    expect(html).toContain("/forgot-password");
    expect(html).not.toContain("Set New Password");
    expect(html).not.toContain("reset password form");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("does not open the form as a silent password change on a plain signed-in visit", async () => {
    feature.getUser.mockResolvedValue({
      id: "user-1",
      email: "owner@shop.com",
    });

    await expect(openResetPage()).rejects.toThrow("redirect:/dashboard");
  });

  it("falls back to the signed-in redirect for arbitrary flow values", async () => {
    feature.getUser.mockResolvedValue({
      id: "user-1",
      email: "owner@shop.com",
    });

    await expect(openResetPage({ flow: "spoofed" })).rejects.toThrow(
      "redirect:/dashboard",
    );
  });
});
