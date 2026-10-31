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
  it("labels the footer navigation and shows the copyright", () => {
    const html = renderToStaticMarkup(<PublicFooter />);

    expect(html).toContain('aria-label="Footer"');
    expect(html).toContain("© 2026 Tracknologia");
  });

  it("links Privacy, Send feedback and Track a repair", () => {
    const html = renderToStaticMarkup(<PublicFooter />);

    expect(html.match(/<a\b/g)).toHaveLength(3);
    expect(html).toMatch(/<a href="\/privacy"[^>]*>Privacy<\/a>/);
    expect(html).toMatch(/<a href="\/feedback"[^>]*>Send feedback<\/a>/);
    expect(html).toMatch(/<a href="\/track"[^>]*>Track a repair<\/a>/);
  });
});
