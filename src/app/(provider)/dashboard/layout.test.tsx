import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked: the auth and operator seams, framework navigation, and the chrome
// components. The layout's own redirect decisions run for real.
const feature = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProviderContext: vi.fn(),
  requireInternalOperator: vi.fn(),
}));

vi.mock("@/features/auth", () => ({
  getUser: feature.getUser,
  getProviderContext: feature.getProviderContext,
  AuthError: class extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/features/internal-operations", () => ({
  requireInternalOperator: feature.requireInternalOperator,
}));

vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));

vi.mock("@/components/shared/brand-logo", () => ({
  BrandLogo: () => null,
}));

vi.mock("./_components/provider-nav", () => ({
  ProviderNav: () => null,
}));

vi.mock("./_components/service-unavailable", () => ({
  ServiceUnavailable: () => null,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import DashboardLayout from "./layout";

const PROVIDER_CONTEXT = {
  providerId: "provider-1",
  providerName: "Test Shop",
  providerType: "SHOP",
  role: "OWNER",
};

async function renderLayout() {
  return DashboardLayout({ children: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  feature.getUser.mockResolvedValue({ id: "user-1" });
});

describe("dashboard layout without a Provider context", () => {
  it("sends an enabled internal operator to /internal", async () => {
    feature.getProviderContext.mockResolvedValue(null);
    feature.requireInternalOperator.mockResolvedValue({
      status: "ALLOWED",
      userId: "user-1",
    });

    await expect(renderLayout()).rejects.toThrow("redirect:/internal");
  });

  it.each(["FORBIDDEN", "UNAUTHENTICATED", "UNAVAILABLE"])(
    "sends %s users to onboarding without revealing /internal",
    async (status) => {
      feature.getProviderContext.mockResolvedValue(null);
      feature.requireInternalOperator.mockResolvedValue({ status });

      await expect(renderLayout()).rejects.toThrow("redirect:/onboarding");
    },
  );
});

describe("dashboard layout with a Provider context", () => {
  it("renders without checking for internal operator access", async () => {
    feature.getProviderContext.mockResolvedValue(PROVIDER_CONTEXT);

    const html = renderToStaticMarkup(await renderLayout());

    expect(html).toContain("min-h-screen");
    expect(feature.requireInternalOperator).not.toHaveBeenCalled();
  });
});
