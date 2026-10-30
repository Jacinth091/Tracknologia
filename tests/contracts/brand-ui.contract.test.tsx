import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StatusGauge } from "@/components/shared/status-gauge";
import { ProviderNav } from "@/app/(provider)/dashboard/_components/provider-nav";
import { RegisterForm } from "@/app/(auth)/_components/register-form";
import { RepairRequestForm } from "@/app/(public)/p/[providerSlug]/request/_components/repair-request-form";
import { TrackingForm } from "@/app/(public)/track/_components/tracking-form";
import TrackRepairPage from "@/app/(public)/track/page";
import RepairsPage from "@/app/(provider)/dashboard/repairs/page";
import RepairRequestsPage from "@/app/(provider)/dashboard/requests/page";
import { listRepairRequests } from "@/features/repair-requests";
import { listRepairs } from "@/features/repairs";
import type { PublicRepairView } from "@/features/tracking";

const { actionState, pathname } = vi.hoisted(() => ({
  actionState: vi.fn(),
  pathname: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: actionState,
}));
vi.mock("next/navigation", () => ({ usePathname: pathname }));
vi.mock("@/app/(auth)/actions", () => ({
  registerAction: vi.fn(),
  signOutAction: vi.fn(),
}));
vi.mock("@/app/(public)/track/actions", () => ({ trackRepairAction: vi.fn() }));
vi.mock("@/app/(public)/p/[providerSlug]/request/actions", () => ({
  submitRepairRequestAction: vi.fn(),
}));
vi.mock("@/features/repairs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/repairs")>()),
  listRepairs: vi.fn(),
}));
vi.mock("@/features/repair-requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/repair-requests")>()),
  listRepairRequests: vi.fn(),
}));

beforeEach(() => {
  actionState.mockReturnValue([null, vi.fn(), false]);
  pathname.mockReturnValue("/dashboard");
});

describe("status illustrations", () => {
  it.each([
    ["SUBMITTED", 15],
    ["ACCEPTED", 30],
    ["IN_PROGRESS", 50],
    ["WAITING_FOR_PARTS", 50],
    ["AWAITING_APPROVAL", 50],
    ["READY", 85],
    ["COMPLETED", 100],
  ] as const)(
    "renders %s without claiming measured progress",
    (status, fill) => {
      const html = renderToStaticMarkup(<StatusGauge status={status} />);
      expect(html).toContain(`stroke-dasharray="${fill} 100"`);
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toMatch(/progressbar|aria-value|\d+%/);
      expect(html.includes("status-gauge-held")).toBe(
        status === "WAITING_FOR_PARTS" || status === "AWAITING_APPROVAL",
      );
    },
  );

  it("distinguishes a declined request from an unknown lookup", () => {
    const declined = renderToStaticMarkup(<StatusGauge status="DECLINED" />);
    const unknown = renderToStaticMarkup(<StatusGauge status={null} />);
    expect(declined).toContain("<path");
    expect(declined).not.toContain("stroke-dasharray");
    expect(unknown).toContain('stroke-dasharray="4 5"');
    expect(unknown).not.toContain("<path");
    for (const html of [declined, unknown]) {
      expect(html).not.toContain("stroke-primary");
    }
  });

  it("names a standalone image with the single thick-ring geometry", () => {
    const html = renderToStaticMarkup(
      <StatusGauge status="READY" label="Ready for handover" />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ready for handover"');
    expect(html).not.toContain("aria-hidden");
    expect(html).toContain('stroke-width="8"');
  });
});

describe("Provider navigation", () => {
  it.each([
    ["/dashboard", "Dashboard"],
    ["/dashboard/repairs/repair-1", "Repairs"],
    ["/dashboard/requests/request-1", "Requests"],
    ["/dashboard/feedback", "Feedback"],
    ["/dashboard/settings", "Settings"],
  ])("marks only the current section for %s", (route, label) => {
    pathname.mockReturnValue(route);
    const html = renderToStaticMarkup(
      <ProviderNav
        isShop={false}
        providerName="River Repair"
        roleLabel="Shop Owner"
      />,
    );
    const current = html.match(/<a\b[^>]*aria-current="page"[^>]*>[^<]*<\/a>/g);
    expect(current).toHaveLength(1);
    expect(current?.[0]).toContain(`>${label}</a>`);
    expect(html).not.toContain("/dashboard/team");
  });

  it("preserves Shop-only Team navigation", () => {
    pathname.mockReturnValue("/dashboard/team");
    const html = renderToStaticMarkup(
      <ProviderNav isShop providerName="River Repair" roleLabel="Shop Owner" />,
    );
    expect(html).toMatch(
      /<a\b[^>]*aria-current="page"[^>]*>Team &amp; Staff<\/a>/,
    );
  });

  it("gives the desktop nav the same role-gated links as the phone sheet", () => {
    // The phone sheet is closed in static markup, so this checks the desktop
    // nav; both render the single `links` list in ProviderNav.
    const linkLabels = (isShop: boolean) => {
      const html = renderToStaticMarkup(
        <ProviderNav
          isShop={isShop}
          providerName="River Repair"
          roleLabel="Shop Owner"
        />,
      );
      return [...html.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map(
        (match) => match[1],
      );
    };
    expect(linkLabels(true)).toEqual([
      "Dashboard",
      "Requests",
      "Repairs",
      "Team &amp; Staff",
      "Feedback",
      "Settings",
    ]);
    expect(linkLabels(false)).toEqual([
      "Dashboard",
      "Requests",
      "Repairs",
      "Feedback",
      "Settings",
    ]);
  });
});

const view: PublicRepairView = {
  providerDisplayName: "River Repair",
  deviceSummary: "Customer laptop",
  deviceType: "Customer laptop",
  brandModel: null,
  currentStatus: "READY",
  statusLabel: "Ready",
  statusDescription: "Your device is ready.",
  serviceMode: "HOME_SERVICE",
  serviceModeLabel: "Home service",
  handoverMessage: "Coordinate the final handover with your Provider.",
  lastUpdatedAt: "2026-10-20T12:00:00Z",
  reportedProblem: "Screen cracked and battery does not charge.",
  submittedAt: "2026-10-20T10:00:00Z",
  customerUpdates: [
    { message: "Latest customer update", createdAt: "2026-10-20T12:00:00Z" },
    { message: "Earlier customer update", createdAt: "2026-10-19T12:00:00Z" },
  ],
  trackingType: "REPAIR",
  trackingCode: "TRK-0123456789ABCDEF",
};

describe("customer tracking", () => {
  it("shows safe status, handover and update content without linking credentials", () => {
    actionState.mockReturnValue([{ outcome: "found", view }, vi.fn(), false]);
    const html = renderToStaticMarkup(<TrackingForm />);
    expect(html).toContain('data-status="READY"');
    expect(html).toContain(view.handoverMessage);
    expect(html).toContain("Home service");
    expect(html).toContain("Latest customer update");
    expect(html).toMatch(
      /<details[^>]*>.*Earlier customer update.*<\/details>/,
    );
    // The Tracking Code appears once, in the ticket eyebrow, and nowhere else.
    expect(html.split(view.trackingCode)).toHaveLength(2);
    expect(html).not.toContain("ACCEPTED");
  });

  it.each(["not-found", "unavailable"])(
    "announces %s without inventing a status",
    (outcome) => {
      actionState.mockReturnValue([
        { outcome, message: "Please try again." },
        vi.fn(),
        false,
      ]);
      const html = renderToStaticMarkup(<TrackingForm />);
      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-describedby="tracking-code-error"');
      expect(html).toContain("Please try again.");
      expect(html.includes('stroke-dasharray="4 5"')).toBe(
        outcome === "not-found",
      );
      expect(html).not.toContain("data-status=");
    },
  );

  it("hides a stale result and disables submission while looking up", () => {
    actionState.mockReturnValue([{ outcome: "found", view }, vi.fn(), true]);
    const html = renderToStaticMarkup(<TrackingForm />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("Looking up...");
    expect(html).not.toContain(view.deviceSummary);
  });

  it.each([
    [" req-0123456789abcdef ", "REQ-0123456789ABCDEF"],
    ["TRK-0123456789ABCDEF", ""],
    ["REQ-invalid", ""],
  ])(
    "only accepts valid Request references from URL prefill: %s",
    async (code, expected) => {
      const html = renderToStaticMarkup(
        await TrackRepairPage({ searchParams: Promise.resolve({ code }) }),
      );
      expect(html).toMatch(
        new RegExp(`<input[^>]*name="trackingCode"[^>]*value="${expected}"`),
      );
    },
  );
});

describe("entry forms", () => {
  it("announces the submitted Request receipt and links its reference", () => {
    const referenceCode = "REQ-0123456789ABCDEF";
    actionState.mockReturnValue([
      { receipt: { referenceCode } },
      vi.fn(),
      false,
    ]);
    const html = renderToStaticMarkup(
      <RepairRequestForm
        providerSlug="river"
        providerName="River Repair"
        supportedDevices={[]}
        serviceModes={[]}
      />,
    );
    expect(html.match(/<div[^>]*role="status"[^>]*>([^<]*)<\/div>/)?.[1]).toBe(
      "Request sent to River Repair",
    );
    expect(html).toContain('data-status="SUBMITTED"');
    expect(html).toContain('stroke-dasharray="15 100"');
    expect(html).toContain(`href="/track?code=${referenceCode}"`);
    expect(html).not.toContain("TRK-");
  });

  it.each([
    [undefined, "INDEPENDENT"],
    ["invite-example", "STAFF"],
  ])(
    "uses native account radios with the correct submitted intent",
    (invite, intent) => {
      const html = renderToStaticMarkup(
        <RegisterForm initialInvite={invite} />,
      );
      const radios = html.match(/<input\b[^>]*type="radio"[^>]*>/g) ?? [];
      expect(radios).toHaveLength(3);
      expect(radios.filter((radio) => radio.includes('checked=""'))).toEqual([
        expect.stringContaining(`value="${intent}"`),
      ]);
      expect(html).toContain(`name="intent" value="${intent}"`);
    },
  );
});

describe("list pagination", () => {
  const emptyLaterPage = {
    items: [],
    page: 3,
    hasPrevious: true,
    hasNext: false,
  };

  it("keeps Previous on an empty later page of Repairs", async () => {
    vi.mocked(listRepairs).mockResolvedValue(emptyLaterPage);
    const html = renderToStaticMarkup(
      await RepairsPage({ searchParams: Promise.resolve({ page: "3" }) }),
    );
    expect(html).toMatch(
      /<a[^>]*href="\/dashboard\/repairs\?page=2"[^>]*>Previous<\/a>/,
    );
    expect(html).toContain("No results");
  });

  it("keeps Previous on an empty later page of Repair Requests", async () => {
    vi.mocked(listRepairRequests).mockResolvedValue(emptyLaterPage);
    const html = renderToStaticMarkup(
      await RepairRequestsPage({
        searchParams: Promise.resolve({ page: "3" }),
      }),
    );
    expect(html).toMatch(
      /<a[^>]*href="\/dashboard\/requests\?page=2"[^>]*>Previous<\/a>/,
    );
    expect(html).toContain("No results");
  });
});
