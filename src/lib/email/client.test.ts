import { beforeEach, describe, expect, it, vi } from "vitest";

type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
  consoleError: vi.spyOn(console, "error").mockImplementation(() => undefined),
  email: {
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "project@gmail.com",
      password: "app_password_test",
    } as SmtpSettings | null,
    from: "Tracknologia <project@gmail.com>",
    isDevLogger: false,
  },
}));

vi.mock("nodemailer", () => ({
  createTransport: mocks.createTransport,
}));

vi.mock("@/lib/config/server", () => ({
  getServerConfig: () => ({
    runtime: "production",
    email: mocks.email,
  }),
}));

import { sendEmail } from "./client";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTransport.mockReturnValue({
    sendMail: mocks.sendMail,
    close: mocks.close,
  });
  mocks.email.smtp = {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "project@gmail.com",
    password: "app_password_test",
  };
});

describe("sendEmail", () => {
  it("sends through an SMTP transport built from the configured settings", async () => {
    mocks.sendMail.mockResolvedValue({ messageId: "<msg-1@smtp.gmail.com>" });

    const result = await sendEmail({
      to: "staff@example.com",
      subject: "Invitation",
      html: "<p>Invite</p>",
      text: "Invite",
    });

    expect(result).toEqual({ success: true, id: "<msg-1@smtp.gmail.com>" });
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: "project@gmail.com", pass: "app_password_test" },
      }),
    );
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Tracknologia <project@gmail.com>",
        to: "staff@example.com",
        subject: "Invitation",
        html: "<p>Invite</p>",
      }),
    );
  });

  it("uses implicit TLS on port 465 without a STARTTLS requirement, and never disables certificate checks", async () => {
    mocks.email.smtp = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: "project@gmail.com",
      password: "app_password_test",
    };
    mocks.sendMail.mockResolvedValue({ messageId: "<msg-2@smtp.gmail.com>" });

    await sendEmail({
      to: "staff@example.com",
      subject: "Invitation",
      html: "<p>Invite</p>",
    });

    const options = mocks.createTransport.mock.calls[0][0];
    expect(options).toEqual(
      expect.objectContaining({ port: 465, secure: true, requireTLS: false }),
    );
    expect(options).not.toHaveProperty("ignoreTLS");
    expect(options).not.toHaveProperty("tls");
  });

  it("maps an SMTP failure to provider_error and logs only the error code", async () => {
    const bodySentinel = "INVITATION_TOKEN_BODY_SENTINEL_91d2";
    const urlSentinel =
      "https://app.tracknologia.example/register?invite=INVITE_URL_SENTINEL_44aa";
    mocks.sendMail.mockRejectedValue(
      Object.assign(
        new Error(`Invalid login for staff@example.com ${urlSentinel}`),
        { code: "EAUTH" },
      ),
    );

    const result = await sendEmail({
      to: "staff@example.com",
      subject: "Invitation",
      html: `<p>${bodySentinel}</p>`,
      text: `${bodySentinel} ${urlSentinel}`,
    });

    expect(result).toEqual({ success: false, reason: "provider_error" });
    const logged = mocks.consoleError.mock.calls.flat().join(" ");
    expect(logged).toContain("EAUTH");
    expect(logged).not.toContain(bodySentinel);
    expect(logged).not.toContain(urlSentinel);
    expect(logged).not.toContain("staff@example.com");
  });

  it("returns EMAIL_DISABLED without SMTP settings, with no transport and no logs", async () => {
    mocks.email.smtp = null;
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
      expect(mocks.createTransport).not.toHaveBeenCalled();
      expect(mocks.sendMail).not.toHaveBeenCalled();
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
