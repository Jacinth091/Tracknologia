import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderNav } from "@/app/(provider)/dashboard/_components/provider-nav";
import ProviderFeedbackPage from "@/app/(provider)/dashboard/feedback/page";
import PublicFeedbackPage from "@/app/(public)/feedback/page";
import { RepairRequestForm } from "@/app/(public)/p/[providerSlug]/request/_components/repair-request-form";
import TrackRepairPage from "@/app/(public)/track/page";
import { FeedbackForm } from "@/features/feedback/ui/feedback-form";
import type { FeedbackFormState } from "@/features/feedback/types";

const { actionState, connection, pathname, requireProviderContext } =
  vi.hoisted(() => ({
    actionState: vi.fn(),
    connection: vi.fn(),
    pathname: vi.fn(),
    requireProviderContext: vi.fn(),
  }));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: actionState,
}));
vi.mock("next/navigation", () => ({ usePathname: pathname }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection,
}));
vi.mock("@/features/auth", () => ({ requireProviderContext }));
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/app/(public)/track/actions", () => ({ trackRepairAction: vi.fn() }));
vi.mock("@/app/(public)/p/[providerSlug]/request/actions", () => ({
  submitRepairRequestAction: vi.fn(),
}));
vi.mock("@/app/(public)/feedback/actions", () => ({
  submitPublicFeedbackAction: vi.fn(),
}));
vi.mock("@/app/(provider)/dashboard/feedback/actions", () => ({
  submitProviderFeedbackAction: vi.fn(),
}));

const NONCE = "5f0c6f7e-3b1a-4c5d-8e9f-0a1b2c3d4e5f";
const INITIAL_NONCE = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const NEXT_NONCE = "7a8b9c0d-1e2f-4a3b-9c8d-7e6f5a4b3c2d";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  actionState.mockReturnValue([null, vi.fn(), false]);
  pathname.mockReturnValue("/dashboard");
  connection.mockResolvedValue(undefined);
  requireProviderContext.mockResolvedValue({});
});

type Rejected = Extract<FeedbackFormState, { status: "rejected" }>;

function rejectedWith(overrides: Partial<Omit<Rejected, "status">>): Rejected {
  return {
    status: "rejected",
    reason: "INVALID_INPUT",
    message: "Check the highlighted fields.",
    fieldErrors: {},
    values: { category: "", title: "", message: "" },
    nonce: NONCE,
    ...overrides,
  };
}

function renderForm(state: FeedbackFormState | null, pending = false) {
  actionState.mockReturnValue([state, vi.fn(), pending]);
  return renderToStaticMarkup(
    <FeedbackForm action={vi.fn()} initialNonce={INITIAL_NONCE} />,
  );
}

function hiddenNonce(html: string) {
  return html.match(/name="submissionNonce" value="([^"]+)"/)?.[1] ?? "";
}

function radioFor(html: string, value: string) {
  const pattern = new RegExp(`<input[^>]*value="${value}"[^>]*>`);
  return html.match(pattern)?.[0] ?? "";
}

describe("feedback form", () => {
  it("renders four categories and the notice before a category is chosen", () => {
    const html = renderForm(null);

    const radios = html.match(/<input\b[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(4);
    for (const radio of radios) {
      expect(radio).toContain('name="category"');
    }
    for (const label of [
      "Bug Report",
      "Usability",
      "Feature Request",
      "General",
    ]) {
      expect(html).toContain(`>${label}</label>`);
    }
    expect(hiddenNonce(html)).toBe(INITIAL_NONCE);
    expect(html).toContain("How we handle your feedback");
    for (const prompt of [
      "What were you trying to do? / What happened? / What did you expect?",
      "What were you trying to do, and what made it harder than expected?",
      "What would you like to be able to do, and why?",
      "What would you like us to know?",
    ]) {
      expect(html).not.toContain(prompt);
    }
  });

  it("keeps the Bug prompt, field error wiring, and submitted text", () => {
    const html = renderForm(
      rejectedWith({
        values: {
          category: "BUG",
          title: "Tracking page",
          message: "Status stuck",
        },
        fieldErrors: { message: "Enter a message before submitting." },
      }),
    );

    expect(radioFor(html, "BUG")).toContain('checked=""');
    expect(html).toContain(
      "What were you trying to do? / What happened? / What did you expect?",
    );
    const textarea = html.match(/<textarea\b[^>]*>/)?.[0] ?? "";
    expect(textarea).toContain('aria-invalid="true"');
    const describedBy =
      textarea.match(/aria-describedby="([^"]*)"/)?.[1].split(" ") ?? [];
    expect(describedBy).toContain("feedback-message-error");
    expect(html).toContain('id="feedback-message-error"');
    expect(html).toContain('value="Tracking page"');
    expect(html).toMatch(/<textarea[^>]*>Status stuck<\/textarea>/);
    expect(hiddenNonce(html)).toBe(NONCE);
  });

  it.each([
    [
      "USABILITY",
      "What were you trying to do, and what made it harder than expected?",
    ],
    ["FEATURE_REQUEST", "What would you like to be able to do, and why?"],
    ["GENERAL", "What would you like us to know?"],
  ])("shows the %s prompt after a rejected attempt", (category, prompt) => {
    const html = renderForm(
      rejectedWith({
        values: { category, title: "", message: "" },
        fieldErrors: { message: "Enter a message before submitting." },
      }),
    );

    expect(radioFor(html, category)).toContain('checked=""');
    expect(html).toContain(prompt);
  });

  it("announces a rejected attempt without field errors as an alert", () => {
    const message = "Too many submissions. Wait a few minutes and try again.";
    const html = renderForm(rejectedWith({ reason: "RATE_LIMITED", message }));

    expect(html).toMatch(/<div[^>]*role="alert"[^>]*>/);
    expect(html).toContain(message);
  });

  it("disables submission and shows progress while pending", () => {
    const html = renderForm(null, true);

    const button = html.match(/<button\b[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(button).toContain('disabled=""');
    expect(button).toContain("Sending...");
  });

  it("confirms an accepted submission and offers another without a form", () => {
    const html = renderForm({ status: "accepted", nextNonce: NEXT_NONCE });

    expect(html).toContain('role="status"');
    expect(html).toContain(
      "Thanks — your feedback was received. We can&#x27;t reply to every submission.",
    );
    expect(html).toContain(">Send more feedback</button>");
    expect(html).not.toContain("<form");
  });
});

describe("feedback entry links", () => {
  it("links Tracking and the Request receipt to the plain /feedback route", async () => {
    actionState.mockReturnValue([
      { receipt: { referenceCode: "REQ-0123456789ABCDEF" } },
      vi.fn(),
      false,
    ]);
    const track = renderToStaticMarkup(
      await TrackRepairPage({ searchParams: Promise.resolve({}) }),
    );
    const receipt = renderToStaticMarkup(
      <RepairRequestForm
        providerSlug="river"
        providerName="River Repair"
        supportedDevices={[]}
        serviceModes={[]}
      />,
    );

    for (const html of [track, receipt]) {
      const link = html.match(/<a\b[^>]*href="\/feedback"[\s\S]*?<\/a>/)?.[0];
      expect(link).toBeDefined();
      expect(link).not.toMatch(/REQ-|TRK-|\?/);
    }
  });
});

describe("Provider feedback navigation", () => {
  it.each([
    ["Shop Owner", true],
    ["Shop Staff", false],
    ["Independent", false],
  ])("links Feedback for %s", (roleLabel, isShop) => {
    const html = renderToStaticMarkup(
      <ProviderNav
        isShop={isShop}
        providerName="River Repair"
        roleLabel={roleLabel}
      />,
    );

    const links =
      html.match(/<a\b[^>]*href="\/dashboard\/feedback"[^>]*>[^<]*<\/a>/g) ??
      [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain(">Feedback</a>");
    expect(html.includes("Team &amp; Staff")).toBe(isShop);
  });

  it("marks Feedback as the current page", () => {
    pathname.mockReturnValue("/dashboard/feedback");
    const html = renderToStaticMarkup(
      <ProviderNav isShop providerName="River Repair" roleLabel="Shop Owner" />,
    );

    const link = html.match(/<a\b[^>]*href="\/dashboard\/feedback"[^>]*>/)?.[0];
    expect(link).toContain('aria-current="page"');
  });
});

describe("feedback pages", () => {
  it("awaits connection before generating the public nonce", async () => {
    let release: () => void = () => {};
    connection.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const randomUUID = vi.spyOn(crypto, "randomUUID");

    const pending = PublicFeedbackPage();
    expect(randomUUID).not.toHaveBeenCalled();

    release();
    const html = renderToStaticMarkup(await pending);

    expect(connection).toHaveBeenCalledTimes(1);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(hiddenNonce(html)).toMatch(UUID_PATTERN);
    randomUUID.mockRestore();
  });

  it("gives each public visit its own nonce", async () => {
    const first = hiddenNonce(
      renderToStaticMarkup(await PublicFeedbackPage()),
    );
    const second = hiddenNonce(
      renderToStaticMarkup(await PublicFeedbackPage()),
    );

    expect(first).toMatch(UUID_PATTERN);
    expect(second).toMatch(UUID_PATTERN);
    expect(second).not.toBe(first);
  });

  it("requires Provider context and renders the shared form", async () => {
    const html = renderToStaticMarkup(await ProviderFeedbackPage());

    expect(requireProviderContext).toHaveBeenCalledTimes(1);
    expect(html).toContain("Send feedback");
    expect(hiddenNonce(html)).toMatch(UUID_PATTERN);
  });
});
