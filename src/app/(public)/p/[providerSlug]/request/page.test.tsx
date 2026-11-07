import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicProvider } = vi.hoisted(() => ({
  getPublicProvider: vi.fn(),
}));
vi.mock("@/features/providers", () => ({ getPublicProvider }));
vi.mock("@/components/shared/public-header", () => ({
  PublicHeader: () => <header>Public header</header>,
}));
vi.mock("./_components/repair-request-form", () => ({
  RepairRequestForm: () => <form aria-label="Repair request" />,
}));

import PublicRepairRequestPage from "./page";

beforeEach(() => vi.clearAllMocks());

describe("public request recovery", () => {
  it("keeps unavailable and nonexistent Providers neutral, with clear recovery links", async () => {
    getPublicProvider.mockResolvedValue(null);
    const html = renderToStaticMarkup(
      await PublicRepairRequestPage({
        params: Promise.resolve({ providerSlug: "missing-provider" }),
      }),
    );
    expect(html).toContain("This request link is unavailable.");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("may not be accepting new Repair Requests");
    expect(html).toMatch(/<a[^>]*href="\/track"[^>]*>Track a repair<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Back to home<\/a>/);
    expect(html).not.toContain('aria-label="Repair request"');
    expect(html).not.toContain("missing-provider");
    expect(html).not.toContain('aria-label="404"');
  });

  it("still renders the form for an available Provider", async () => {
    getPublicProvider.mockResolvedValue({
      displayName: "River Repair",
      slug: "river-repair",
      supportedDevices: [],
      serviceModes: [],
    });
    const html = renderToStaticMarkup(
      await PublicRepairRequestPage({
        params: Promise.resolve({ providerSlug: "river-repair" }),
      }),
    );
    expect(html).toContain('aria-label="Repair request"');
    expect(html).toContain("Request repair service from River Repair");
    expect(html).not.toContain("This request link is unavailable.");
  });
});
