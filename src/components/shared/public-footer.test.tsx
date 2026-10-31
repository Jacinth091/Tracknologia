import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={props.className}>
      {children}
    </a>
  ),
}));

import { PublicFooter } from "./public-footer";

describe("PublicFooter", () => {
  it("is the dark brand footer with a navigation landmark", () => {
    const html = renderToStaticMarkup(<PublicFooter />);

    expect(html).toContain("bg-foreground");
    expect(html).toContain("text-background");
    expect(html).toContain('aria-label="Footer navigation"');
  });

  it("shows the copyright with the current year", () => {
    const html = renderToStaticMarkup(<PublicFooter />);

    expect(html).toContain(`Tracknologia © ${new Date().getFullYear()}`);
  });

  it("links Track, Send feedback, Privacy and Sign In in order", () => {
    const html = renderToStaticMarkup(<PublicFooter />);
    const links = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)];

    expect(links.map((link) => [link[1], link[2]])).toEqual([
      ["/track", "Track"],
      ["/feedback", "Send feedback"],
      ["/privacy", "Privacy"],
      ["/login", "Sign In"],
    ]);
  });
});
