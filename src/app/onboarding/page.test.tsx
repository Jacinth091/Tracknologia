import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProviderContext: vi.fn(),
  getInvitationForOnboarding: vi.fn(),
  useActionState: vi.fn(),
  getCookie: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: mocks.useActionState,
}));
vi.mock("@/features/auth", () => ({
  getUser: mocks.getUser,
  getProviderContext: mocks.getProviderContext,
}));
vi.mock("@/features/providers", () => ({
  getInvitationForOnboarding: mocks.getInvitationForOnboarding,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.getCookie,
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("./actions", () => ({
  onboardIndependentAction: vi.fn(),
  onboardShopAction: vi.fn(),
  acceptStaffInviteAction: vi.fn(),
}));

import OnboardingPage from "./page";

const INVITE = `inv_${"a".repeat(48)}`;

async function renderPage(params: { invite?: string } = {}) {
  return renderToStaticMarkup(
    await OnboardingPage({ searchParams: Promise.resolve(params) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCookie.mockReturnValue(undefined);
  mocks.getUser.mockResolvedValue({
    id: "user-1",
    email: "provider@example.test",
    userMetadata: { intent: "INDEPENDENT" },
  });
  mocks.getProviderContext.mockResolvedValue(null);
  mocks.getInvitationForOnboarding.mockResolvedValue(null);
  mocks.useActionState.mockReturnValue([null, vi.fn(), false]);
});

describe("onboarding account path", () => {
  it.each([
    [
      { intent: "INDEPENDENT" },
      "Set up your independent profile",
      "Create workspace",
    ],
    [{ intent: "SHOP" }, "Set up your repair shop", "Create shop"],
    [{ intent: "STAFF" }, "Join your shop", "Join shop"],
    [
      { provider_type: "INDEPENDENT" },
      "Set up your independent profile",
      "Create workspace",
    ],
    [{ provider_type: "SHOP" }, "Set up your repair shop", "Create shop"],
  ])(
    "keeps the registered account type %j on its own path",
    async (userMetadata, heading, action) => {
      mocks.getUser.mockResolvedValue({ id: "user-1", userMetadata });
      const html = await renderPage();
      expect(html).toContain(`>${heading}</h1>`);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).toContain(action);
      expect(html).not.toContain('name="onboarding-intent"');
      expect(html.includes('name="ownerName"')).toBe(
        heading !== "Join your shop",
      );
      expect(html.includes('name="token"')).toBe(heading === "Join your shop");
    },
  );

  it("offers a choice only when signup type is missing or invalid", async () => {
    mocks.getUser.mockResolvedValue({
      id: "user-1",
      userMetadata: { intent: "OTHER", provider_type: "OTHER" },
    });
    const html = await renderPage();
    expect(html.match(/name="onboarding-intent"/g)).toHaveLength(3);
    expect(html).toContain("How will you use Tracknologia?");
  });

  it.each(["url", "cookie"])(
    "an invitation from the %s opens only the Staff path",
    async (source) => {
      if (source === "cookie")
        mocks.getCookie.mockReturnValue({ value: INVITE });
      mocks.getInvitationForOnboarding.mockResolvedValue({
        invitationId: "invitation-1",
        providerId: "provider-1",
        email: "provider@example.test",
        role: "STAFF",
        shopName: "River Repair",
      });
      const html = await renderPage(source === "url" ? { invite: INVITE } : {});
      expect(html).toContain("Join your shop</h1>");
      expect(html).toContain("River Repair");
      expect(html).toMatch(
        new RegExp(
          `<input[^>]*type="hidden"[^>]*name="token"[^>]*value="${INVITE}"`,
        ),
      );
      expect(html).not.toContain('name="onboarding-intent"');
      expect(html).not.toContain('name="ownerName"');
      expect(mocks.getInvitationForOnboarding).toHaveBeenCalledWith(
        INVITE,
        expect.anything(),
      );
    },
  );

  it("requires sign-in before showing setup", async () => {
    mocks.getUser.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("redirect:/login");
  });

  it("sends an existing Provider member to the dashboard", async () => {
    mocks.getProviderContext.mockResolvedValue({ providerId: "provider-1" });
    await expect(renderPage()).rejects.toThrow("redirect:/dashboard");
  });
});

describe("onboarding forms", () => {
  it("groups owner details and keeps all existing submission fields", async () => {
    const html = await renderPage();
    for (const heading of [
      "Personal details",
      "Business details",
      "Services &amp; coverage",
    ]) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    for (const name of [
      "ownerName",
      "ownerContactPhone",
      "displayName",
      "contactEmail",
      "contactPhone",
      "publicAddress",
      "serviceArea",
      "serviceModes",
      "serviceModeDetails.OTHER",
      "supportedDevices",
      "acceptingRequests",
    ]) {
      expect(inputs.some((input) => input.includes(`name="${name}"`))).toBe(
        true,
      );
    }
    expect(html).toContain('name="description"');
    const required = inputs.filter((input) => input.includes('required=""'));
    expect(required).toHaveLength(2);
    expect(required.some((input) => input.includes('name="ownerName"'))).toBe(
      true,
    );
    expect(required.some((input) => input.includes('name="displayName"'))).toBe(
      true,
    );
    expect(html).not.toMatch(/<details[^>]*open=""/);
    expect(
      inputs.find((input) => input.includes('name="acceptingRequests"')),
    ).toContain('checked=""');
  });

  it("opens optional sections and links their validation errors to the inputs", async () => {
    mocks.useActionState.mockReturnValue([
      {
        error: "Check your details.",
        fieldErrors: {
          contactEmail: "Use a valid email.",
          serviceArea: "Shorten the service area.",
        },
      },
      vi.fn(),
      false,
    ]);
    const html = await renderPage();
    expect(html.match(/<details[^>]*open=""/g)).toHaveLength(2);
    expect(html).toContain('aria-describedby="contact-email-error"');
    expect(html).toContain('id="contact-email-error"');
    expect(html).toContain("Use a valid email.");
    expect(html).toContain('aria-describedby="ind-area-error"');
    expect(html).toContain("Shorten the service area.");
  });

  it("disables owner inputs and submission while setup is pending", async () => {
    mocks.useActionState.mockReturnValue([null, vi.fn(), true]);
    const html = await renderPage();
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Creating workspace...");
    for (const input of html.match(/<input\b[^>]*>/g) ?? []) {
      expect(input).toContain('disabled=""');
    }
  });
});
