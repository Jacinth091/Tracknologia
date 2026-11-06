// Runs in UTC so the rendered timestamps prove the Asia/Manila pin, not the host zone.
process.env.TZ = "UTC";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const feature = vi.hoisted(() => ({
  getInternalHealth: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
  requireInternalOperator: vi.fn(),
}));

vi.mock("@/features/internal-operations", () => ({
  getInternalHealth: feature.getInternalHealth,
  recordSensitiveInternalAccess: feature.recordSensitiveInternalAccess,
  requireInternalOperator: feature.requireInternalOperator,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import type { InternalHealth } from "@/features/internal-operations";
import HealthPage from "./page";

const fixture: InternalHealth = {
  checkedAt: "2026-11-03T09:00:00.000Z",
  application: {
    status: "healthy",
    latencyMs: null,
    observedAt: "2026-11-03T09:00:00.000Z",
  },
  database: {
    status: "degraded",
    latencyMs: 1200,
    observedAt: "2026-11-03T09:00:00.000Z",
  },
  auth: {
    status: "unavailable",
    latencyMs: null,
    observedAt: "2026-11-03T09:00:00.000Z",
  },
  email: { status: "unknown", latencyMs: null, observedAt: null },
};

async function renderHealth() {
  return renderToStaticMarkup(await HealthPage());
}

describe("Service health page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feature.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-user",
    });
    feature.recordSensitiveInternalAccess.mockResolvedValue(true);
    feature.getInternalHealth.mockResolvedValue(fixture);
  });

  it("renders every check with its truthful status and latency", async () => {
    const html = await renderHealth();

    expect(html).toContain(">Application<");
    expect(html).toContain(">Database<");
    expect(html).toContain(">Authentication<");
    expect(html).toContain(">Email<");
    expect(html).toContain(">Healthy<");
    expect(html).toContain(">Degraded<");
    expect(html).toContain(">Unavailable<");
    expect(html).toContain(">Unknown<");
    expect(html).toContain("1200 ms");
    expect(html).toContain("Not probed");
    expect(feature.recordSensitiveInternalAccess).toHaveBeenCalledWith(
      "INTERNAL_ACCESS_VIEW",
    );
  });

  it("explains why email is unknown instead of showing it healthy", async () => {
    const html = await renderHealth();

    expect(html).toContain("SMTP is configured, but deliveries are not probed");
  });

  it("renders a deliberate refresh and the probe time", async () => {
    const html = await renderHealth();

    expect(html).toContain('href="/internal/health"');
    expect(html).toContain("Refresh");
    expect(html).toContain("Probed");
    expect(html).toContain("No auto-refresh");
    expect(html).toContain('href="/internal/diagnostics"');
  });

  it("shows unprobed services as not probed, never zero", async () => {
    feature.getInternalHealth.mockResolvedValue({
      ...fixture,
      email: { status: "unavailable", latencyMs: null, observedAt: null },
    });

    const html = await renderHealth();

    expect(html).toContain("No email transport is configured");
  });

  it("redirects anonymous visitors to sign in", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAUTHENTICATED",
    });

    await expect(renderHealth()).rejects.toThrow(
      "redirect:/login?redirectTo=%2Finternal%2Fhealth",
    );
  });

  it("hides the page from non-operators", async () => {
    feature.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });

    await expect(renderHealth()).rejects.toThrow("notFound");
  });

  it("fails closed when the guard is unavailable", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAVAILABLE",
    });

    expect(await renderHealth()).toContain("Internal access unavailable");
  });

  it("fails closed when the access audit cannot be recorded", async () => {
    feature.recordSensitiveInternalAccess.mockResolvedValue(false);

    expect(await renderHealth()).toContain("Internal access unavailable");
    expect(feature.getInternalHealth).not.toHaveBeenCalled();
  });

  it("reports unavailable checks instead of throwing", async () => {
    feature.getInternalHealth.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await renderHealth()).toContain("Health checks are unavailable");
  });
});
