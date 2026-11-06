import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sign-up confirmation email", () => {
  it("uses Supabase's confirmation link for both actions and registers the local template", () => {
    const html = readFileSync("supabase/templates/confirmation.html", "utf8");
    const config = readFileSync("supabase/config.toml", "utf8");

    expect(
      [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
    ).toEqual(["{{ .ConfirmationURL }}", "{{ .ConfirmationURL }}"]);
    expect(html).toMatch(/>\s*\{\{ \.ConfirmationURL \}\}\s*<\/a\s*>/);
    expect(html).toContain('src="{{ .SiteURL }}/email/wordmark.png"');
    expect(config).toMatch(
      /\[auth\.email\.template\.confirmation\]\s+subject = "Confirm your Tracknologia email"\s+content_path = "\.\/supabase\/templates\/confirmation\.html"/,
    );
  });
});
