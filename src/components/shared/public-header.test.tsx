import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a
      href={href}
      className={props.className}
      aria-current={props["aria-current"]}
    >
      {children}
    </a>
  ),
}));

import { PublicHeader } from "./public-header";

function cookiesNamed(...names: string[]) {
  cookies.mockResolvedValue({
    getAll: () => names.map((name) => ({ name, value: "value" })),
  });
}

describe("PublicHeader", () => {
  beforeEach(() => {
    cookiesNamed();
  });

  it("links the logo home and offers Track a repair and Sign In", async () => {
    const html = renderToStaticMarkup(await PublicHeader({}));

    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toMatch(/<a href="\/"[^>]*>/);
    expect(html).toMatch(/<a href="\/track"[^>]*>Track a repair<\/a>/);
    expect(html).toMatch(/<a href="\/login"[^>]*>Sign In<\/a>/);
  });

  it("marks the current page with aria-current", async () => {
    const html = renderToStaticMarkup(await PublicHeader({ current: "track" }));

    expect(html).toMatch(
      /<a href="\/track"[^>]*aria-current="page"[^>]*>Track a repair<\/a>/,
    );
    const plain = renderToStaticMarkup(await PublicHeader({}));
    expect(plain.includes('aria-current="page"')).toBe(false);
  });

  it("renders extra links first, hidden below the small breakpoint", async () => {
    const html = renderToStaticMarkup(
      await PublicHeader({
        extraLinks: [{ href: "#providers", label: "For providers" }],
      }),
    );

    expect(html.indexOf("For providers")).toBeLessThan(
      html.indexOf("Track a repair"),
    );
    expect(html).toMatch(
      /<a href="#providers" class="hidden [^"]*">For providers<\/a>/,
    );
  });

  it("shows Dashboard and links the logo there when an auth cookie exists", async () => {
    cookiesNamed("sb-abcdefgh-auth-token");
    const html = renderToStaticMarkup(await PublicHeader({}));

    expect(html).toMatch(/<a href="\/dashboard"[^>]*>/);
    expect(html).toMatch(/<a href="\/dashboard"[^>]*>Dashboard<\/a>/);
    expect(html).not.toContain("Sign In");
  });

  it("treats chunked auth cookies as signed in", async () => {
    cookiesNamed("sb-abcdefgh-auth-token.0", "sb-abcdefgh-auth-token.1");
    const html = renderToStaticMarkup(await PublicHeader({}));

    expect(html).toMatch(/<a href="\/dashboard"[^>]*>Dashboard<\/a>/);
    expect(html).not.toContain("Sign In");
  });

  it("ignores cookies that are not Supabase auth tokens", async () => {
    cookiesNamed("theme", "sb-abcdefgh-refresh");
    const html = renderToStaticMarkup(await PublicHeader({}));

    expect(html).toMatch(/<a href="\/login"[^>]*>Sign In<\/a>/);
    expect(html).not.toContain("Dashboard");
  });
});
