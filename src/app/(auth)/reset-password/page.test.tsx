import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked: the auth seam and framework navigation. The page's own recovery
// state resolution runs for real.
const feature = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/features/auth", () => feature);

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
});

describe("reset password page states (#126)", () => {
  it("shows the recovery-link state for an unauthenticated visitor", async () => {
    const html = renderToStaticMarkup(await openResetPage());

    expect(html).toContain("Recovery link required");
    expect(html).toContain("/forgot-password");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("shows the password form after the recovery exchange", async () => {
    feature.getUser.mockResolvedValue({
      id: "user-1",
      email: "owner@shop.com",
    });

    const html = renderToStaticMarkup(
      await openResetPage({ flow: "recovery" }),
    );

    expect(html).toContain("Set New Password");
    expect(html).toContain("reset password form");
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
