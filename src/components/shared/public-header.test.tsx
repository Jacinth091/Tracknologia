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

describe("PublicHeader", () => {
  it("links the logo home and offers Track a repair and Sign In", () => {
    const html = renderToStaticMarkup(<PublicHeader />);

    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toMatch(/<a href="\/"[^>]*>/);
    expect(html).toMatch(/<a href="\/track"[^>]*>Track a repair<\/a>/);
    expect(html).toMatch(/<a href="\/login"[^>]*>Sign In<\/a>/);
  });

  it("marks the current page with aria-current", () => {
    const html = renderToStaticMarkup(<PublicHeader current="track" />);

    expect(html).toMatch(
      /<a href="\/track"[^>]*aria-current="page"[^>]*>Track a repair<\/a>/,
    );
    expect(
      renderToStaticMarkup(<PublicHeader />).includes('aria-current="page"'),
    ).toBe(false);
  });

  it("renders extra links first, hidden below the small breakpoint", () => {
    const html = renderToStaticMarkup(
      <PublicHeader
        extraLinks={[{ href: "#providers", label: "For providers" }]}
      />,
    );

    expect(html.indexOf("For providers")).toBeLessThan(
      html.indexOf("Track a repair"),
    );
    expect(html).toMatch(
      /<a href="#providers" class="hidden [^"]*">For providers<\/a>/,
    );
  });
});
