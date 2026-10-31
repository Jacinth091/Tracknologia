import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}));

import PrivacyPage from "./page";

describe("privacy page", () => {
  it("renders the five sections, the contact link and the approved notice", async () => {
    const html = await new Response(
      await renderToReadableStream(<PrivacyPage />),
    ).text();

    for (const heading of [
      "1. Feedback",
      "2. Repair requests and repairs (customers)",
      "3. Tracking a repair",
      "4. Repair shops and repairers (Provider accounts)",
      "5. Who we are and how to reach us",
    ]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    expect(html).toContain('href="mailto:tracknologia67@gmail.com"');
    expect(html).toContain("We can&#x27;t reply to every message.");
    expect(html).toContain("Last updated: 31 October 2026.");
  });

  it("lists the five sections as anchors to their headings", async () => {
    const html = await new Response(
      await renderToReadableStream(<PrivacyPage />),
    ).text();

    for (const id of [
      "privacy-feedback",
      "privacy-repairs",
      "privacy-tracking",
      "privacy-providers",
      "privacy-contact",
    ]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("keeps the labelled sentences word for word", async () => {
    const html = await new Response(
      await renderToReadableStream(<PrivacyPage />),
    ).text();

    expect(html).toContain("What we collect:");
    expect(html).toContain("Who can see it:");
    expect(html).toContain("How long we keep it:");
    expect(html).toContain("Other shops and repairers can&#x27;t.");
    expect(html).toContain("Your shop&#x27;s public page shows only");
  });

  it("renders the shared public header", async () => {
    const html = await new Response(
      await renderToReadableStream(<PrivacyPage />),
    ).text();

    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain("Track a repair");
  });
});
