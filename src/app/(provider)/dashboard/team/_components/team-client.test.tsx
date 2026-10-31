import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderInvitation } from "@/features/providers";
import type { InviteStaffState } from "../actions";
import { TeamClient } from "./team-client";

const { actions, useActionState } = vi.hoisted(() => ({
  actions: { invite: vi.fn(), revoke: vi.fn(), remove: vi.fn() },
  useActionState: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState,
}));
vi.mock("../actions", () => ({
  inviteStaffAction: actions.invite,
  revokeStaffAction: actions.revoke,
  removeStaffAction: actions.remove,
}));

const RAW_TOKEN = "inv_0123456789abcdef0123456789abcdef0123456789abcdef";
const PENDING: ProviderInvitation = {
  id: "invitation-1",
  providerId: "provider-1",
  email: "tech@shop.com",
  role: "STAFF",
  invitedByUserId: "owner-1",
  createdAt: "2026-10-30T09:00:00.000Z",
  expiresAt: "2026-11-06T09:00:00.000Z",
};

function renderTeam(state: InviteStaffState | null) {
  useActionState.mockImplementation((action: unknown) => [
    action === actions.invite ? state : null,
    vi.fn(),
    false,
  ]);
  return renderToStaticMarkup(
    <TeamClient isOwner isShop members={[]} invitations={[PENDING]} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("team invitation without email", () => {
  it("says the invitation was created, keeps the copy link, and never says sent", () => {
    const html = renderTeam({
      success:
        "Invitation created for tech@shop.com, but the email was not sent. Copy this link now and share it directly, or revoke the invitation and invite again to create a new link.",
      token: RAW_TOKEN,
      inviteUrl: `/register?invite=${RAW_TOKEN}`,
      emailDeliveryFailed: true,
    });

    expect(html).toContain("Invitation created");
    expect(html).toContain("We didn&#x27;t email this invitation.");
    expect(html).toContain("Copy Link");
    expect(html).toContain(RAW_TOKEN);
    expect(html).toContain("Invitations waiting to be accepted");
    expect(html).toContain("Created ");
    expect(html).not.toContain("Sent");
    expect(html).not.toContain("sent to");
    expect(html).not.toContain("Email Failed");
  });
});
