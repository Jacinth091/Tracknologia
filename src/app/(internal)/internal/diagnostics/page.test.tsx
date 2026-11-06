// Runs in UTC so the rendered timestamps prove the Asia/Manila pin, not the host zone.
process.env.TZ = "UTC";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const feature = vi.hoisted(() => ({
  deploymentRevision: vi.fn(),
  getInternalHealth: vi.fn(),
  recordSensitiveInternalAccess: vi.fn(),
  requireInternalOperator: vi.fn(),
}));

const config = vi.hoisted(() => ({ getServerConfig: vi.fn() }));

vi.mock("@/features/internal-operations", () => ({
  deploymentRevision: feature.deploymentRevision,
  getInternalHealth: feature.getInternalHealth,
  recordSensitiveInternalAccess: feature.recordSensitiveInternalAccess,
  requireInternalOperator: feature.requireInternalOperator,
}));

vi.mock("@/lib/config/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server")>()),
  getServerConfig: config.getServerConfig,
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
import { parseServerConfig } from "@/lib/config/server";
import DiagnosticsPage from "./page";

const health: InternalHealth = {
  checkedAt: "2026-11-03T09:00:00.000Z",
  application: {
    status: "healthy",
    latencyMs: null,
    observedAt: "2026-11-03T09:00:00.000Z",
  },
  database: {
    status: "healthy",
    latencyMs: 42,
    observedAt: "2026-11-03T09:00:00.000Z",
  },
  auth: {
    status: "degraded",
    latencyMs: 1500,
    observedAt: "2026-11-03T09:00:00.000Z",
  },
  email: { status: "unavailable", latencyMs: null, observedAt: null },
};

const serverEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://tracknologia.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  PUBLIC_ABUSE_HMAC_SECRET: "test-hmac-secret-at-least-32-characters",
  PUBLIC_ABUSE_CLIENT_IP_SOURCE: "vercel",
  VERCEL: "1",
};

async function renderDiagnostics() {
  return renderToStaticMarkup(await DiagnosticsPage());
}

describe("Diagnostics page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feature.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "operator-user",
    });
    feature.recordSensitiveInternalAccess.mockResolvedValue(true);
    feature.getInternalHealth.mockResolvedValue(health);
    feature.deploymentRevision.mockReturnValue("abc1234");
    config.getServerConfig.mockReturnValue(parseServerConfig(serverEnv));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows deployment provenance and the safe runtime facts", async () => {
    const html = await renderDiagnostics();

    expect(html).toContain("abc1234");
    expect(html).toContain("production");
    expect(html).toContain("https://tracknologia.example");
    expect(html).toContain("Diagnostics retention");
    expect(html).toContain("7 days approved (#87)");
    expect(html).toContain("No automatic deletion; owner reviews monthly");
    expect(html).not.toContain("retained rows only");
    expect(html).toContain("Vercel forwarded IP");
    expect(html).toContain("Not configured");
    expect(html).toContain("Required");
    expect(html).toContain("Disabled");
  });

  it.each(["local", "test"])(
    "shows the console email logger in %s",
    async (runtime) => {
      config.getServerConfig.mockReturnValue(
        parseServerConfig({
          ...serverEnv,
          NODE_ENV: runtime === "local" ? "development" : "test",
        }),
      );

      expect(await renderDiagnostics()).toContain("Dev logger (console)");
    },
  );

  it("shows configured SMTP without exposing its credentials", async () => {
    config.getServerConfig.mockReturnValue(
      parseServerConfig({
        ...serverEnv,
        SMTP_HOST: "smtp.example.test",
        SMTP_USER: "private-smtp-user",
        SMTP_PASSWORD: "private-smtp-password",
      }),
    );
    const html = await renderDiagnostics();

    expect(html).toContain("SMTP configured");
    expect(html).not.toContain("Dev logger (console)");
    expect(html).not.toContain("smtp.example.test");
    expect(html).not.toContain("private-smtp-user");
    expect(html).not.toContain("private-smtp-password");
  });

  it("says the revision is missing rather than inventing one", async () => {
    feature.deploymentRevision.mockReturnValue(null);

    expect(await renderDiagnostics()).toContain("Not reported by this runtime");
  });

  it("renders raw probe detail for every service", async () => {
    const html = await renderDiagnostics();

    expect(html).toContain("42 ms");
    expect(html).toContain("1500 ms");
    expect(html).toContain(">Degraded<");
    expect(html).toContain(">Unavailable<");
    expect(html).toContain("Not probed");
    expect(html).toContain('href="/internal/health"');
  });

  it("labels every signal the console does not observe", async () => {
    const html = await renderDiagnostics();

    expect(html).toContain("Independent uptime");
    expect(html).toContain("Host and database telemetry");
    expect(html).toContain("Operation counters");
    expect(html).toContain("Incidents");
  });

  it("redirects anonymous visitors to sign in", async () => {
    feature.requireInternalOperator.mockResolvedValue({
      status: "UNAUTHENTICATED",
    });

    await expect(renderDiagnostics()).rejects.toThrow(
      "redirect:/login?redirectTo=%2Finternal%2Fdiagnostics",
    );
  });

  it("hides the page from non-operators", async () => {
    feature.requireInternalOperator.mockResolvedValue({ status: "FORBIDDEN" });

    await expect(renderDiagnostics()).rejects.toThrow("notFound");
  });

  it("fails closed when the access audit cannot be recorded", async () => {
    feature.recordSensitiveInternalAccess.mockResolvedValue(false);

    expect(await renderDiagnostics()).toContain("Internal access unavailable");
    expect(feature.getInternalHealth).not.toHaveBeenCalled();
  });

  it("reports unavailable diagnostics instead of throwing", async () => {
    config.getServerConfig.mockImplementation(() => {
      throw new Error("bad config");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await renderDiagnostics()).toContain(
      "Diagnostics are unavailable right now",
    );
  });
});
