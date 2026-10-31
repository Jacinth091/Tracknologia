import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  consoleError: vi.spyOn(console, "error").mockImplementation(() => undefined),
  resend: {
    apiKey: "re_production_key" as string | null,
    fromEmail: "Tracknologia <team@tracknologia.example>",
    isDevLogger: false,
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock("@/lib/config/server", () => ({
  getServerConfig: () => ({
    runtime: "production",
    resend: mocks.resend,
  }),
}));

import { sendEmail } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resend.apiKey = "re_production_key";
});

describe("sendEmail", () => {
  it("maps an actual Resend adapter rejection to explicit non-success without logging body secrets", async () => {
    const bodySentinel = "INVITATION_TOKEN_BODY_SENTINEL_91d2";
    mocks.send.mockRejectedValue(new Error("Resend unavailable"));

    const result = await sendEmail({
      to: "staff@example.com",
      subject: "Invitation",
      html: `<p>${bodySentinel}</p>`,
      text: bodySentinel,
    });

    expect(result).toEqual({ success: false, reason: "provider_error" });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(bodySentinel),
        text: bodySentinel,
      }),
    );
    const logged = mocks.consoleError.mock.calls.flat().join(" ");
    expect(logged).not.toContain(bodySentinel);
  });

  it("maps a Resend provider error response to explicit non-success", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { message: "invalid API key" },
    });

    await expect(
      sendEmail({
        to: "staff@example.com",
        subject: "Invitation",
        html: "<p>Invite</p>",
      }),
    ).resolves.toEqual({ success: false, reason: "provider_error" });
  });

  it("returns EMAIL_DISABLED in production without a key, with no Resend call and no logs", async () => {
    mocks.resend.apiKey = null;
    const logSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
    ];

    try {
      const result = await sendEmail({
        to: "staff@example.com",
        subject: "You're invited to join River Repair on Tracknologia",
        html: "<p>INVITE_CODE_SENTINEL_7c3e</p>",
        text: "Join Link: https://app.tracknologia.example/register?invite=INVITE_CODE_SENTINEL_7c3e",
      });

      expect(result).toEqual({ success: false, reason: "EMAIL_DISABLED" });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.consoleError).not.toHaveBeenCalled();
      for (const spy of logSpies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of logSpies) {
        spy.mockRestore();
      }
    }
  });
});
