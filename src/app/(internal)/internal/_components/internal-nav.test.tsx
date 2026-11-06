import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/internal" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    "aria-current"?: "page";
  }) => (
    <a href={href} aria-current={props["aria-current"]}>
      {children}
    </a>
  ),
}));

import { InternalNav } from "./internal-nav";

function currentLinks(html: string) {
  return [...html.matchAll(/<a href="([^"]+)"[^>]*>/g)]
    .filter(([tag]) => tag.includes('aria-current="page"'))
    .map(([, href]) => href);
}

beforeEach(() => {
  navigation.pathname = "/internal";
});

describe("InternalNav", () => {
  it.each(["reports", "health", "diagnostics"])(
    "keeps %s reachable and current after combining internal pages",
    (page) => {
      navigation.pathname = `/internal/${page}`;
      const html = renderToStaticMarkup(<InternalNav />);

      expect(currentLinks(html)).toEqual([navigation.pathname]);
      for (const path of ["reports", "health", "diagnostics"]) {
        expect(html).toContain(`href="/internal/${path}"`);
      }
    },
  );

  it("marks Overview as current only on the exact overview path", () => {
    const html = renderToStaticMarkup(<InternalNav />);

    expect(currentLinks(html)).toEqual(["/internal"]);
  });

  it("marks Feedback as current on a feedback detail page", () => {
    navigation.pathname = "/internal/feedback/abc";
    const html = renderToStaticMarkup(<InternalNav />);

    expect(currentLinks(html)).toEqual(["/internal/feedback"]);
  });

  it("marks Activity as current on the validation metrics page", () => {
    navigation.pathname = "/internal/activity";
    const html = renderToStaticMarkup(<InternalNav />);

    expect(currentLinks(html)).toEqual(["/internal/activity"]);
  });
});
