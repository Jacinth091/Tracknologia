import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("404 recovery", () => {
  it("shows a branded page with working recovery routes without requiring auth", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain('aria-label="404"');
    expect(html).toContain("We couldn’t find that page.");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Back to home<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/track"[^>]*>Track a repair<\/a>/);
    expect(html).toContain('aria-label="Footer navigation"');
  });
});
