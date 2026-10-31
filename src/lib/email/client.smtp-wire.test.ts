import {
  createServer,
  type AddressInfo,
  type Server,
  type Socket,
} from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

// No nodemailer mock here: these tests run the real transport against a local
// socket server. Only the config seam is replaced, to point it at that server.

const SMTP_PASSWORD = "app_password_wire_test_9f2c";

const mocks = vi.hoisted(() => ({
  email: {
    smtp: null as null | {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    },
    from: "Tracknologia <project@gmail.com>",
    isDevLogger: false,
  },
}));

vi.mock("@/lib/config/server", () => ({
  getServerConfig: () => ({
    runtime: "production",
    email: mocks.email,
  }),
}));

import { sendEmail } from "./client";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
  vi.restoreAllMocks();
});

function listen(server: Server, sockets: Set<Socket>) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      closers.push(
        () =>
          new Promise<void>((done) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            server.close(() => done());
          }),
      );
      resolve((server.address() as AddressInfo).port);
    });
  });
}

// Greets, advertises AUTH but never STARTTLS, and records every command.
async function startAuthWithoutStartTls() {
  const received: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.write("220 fake-smtp.test ESMTP ready\r\n");

    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      let end = pending.indexOf("\r\n");
      while (end !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        received.push(line);
        if (/^(EHLO|HELO)\b/i.test(line)) {
          socket.write(
            "250-fake-smtp.test\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n",
          );
        } else if (/^QUIT\b/i.test(line)) {
          socket.end("221 bye\r\n");
        } else {
          socket.write("503 bad sequence of commands\r\n");
        }
        end = pending.indexOf("\r\n");
      }
    });
  });
  const port = await listen(server, sockets);
  return { port, received };
}

// Accepts the connection and never sends the 220 greeting.
async function startStalledSmtp() {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
  });
  return { port: await listen(server, sockets) };
}

function spyConsole() {
  return [
    vi.spyOn(console, "log").mockImplementation(() => undefined),
    vi.spyOn(console, "info").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
  ];
}

function useSmtpServer(port: number) {
  mocks.email.smtp = {
    host: "127.0.0.1",
    port,
    secure: false,
    user: "project@gmail.com",
    password: SMTP_PASSWORD,
  };
}

describe("sendEmail over a real SMTP connection", () => {
  it("never sends AUTH or message data when the server does not offer STARTTLS", async () => {
    const server = await startAuthWithoutStartTls();
    useSmtpServer(server.port);
    const spies = spyConsole();

    const result = await sendEmail({
      to: "staff@example.com",
      subject: "You're invited to join River Repair on Tracknologia",
      html: "<p>INVITE_CODE_WIRE_SENTINEL</p>",
      text: "Join Link: https://app.tracknologia.example/register?invite=INVITE_CODE_WIRE_SENTINEL",
    });

    expect(result).toEqual({ success: false, reason: "provider_error" });
    expect(server.received.some((line) => /^EHLO\b/i.test(line))).toBe(true);
    expect(server.received.some((line) => /^AUTH\b/i.test(line))).toBe(false);
    expect(server.received.some((line) => /^MAIL FROM/i.test(line))).toBe(
      false,
    );
    expect(server.received.some((line) => /^DATA$/i.test(line))).toBe(false);

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map(String)
      .join(" ");
    expect(logged).toContain("[Email Error]: SMTP delivery failed (");
    expect(logged).not.toContain(SMTP_PASSWORD);
    expect(logged).not.toContain("staff@example.com");
    expect(logged).not.toContain("INVITE_CODE_WIRE_SENTINEL");
    expect(logged).not.toContain("/register?invite=");
  });

  it("returns provider_error within the send deadline when the server never greets", async () => {
    const server = await startStalledSmtp();
    useSmtpServer(server.port);
    const spies = spyConsole();

    const started = Date.now();
    const result = await sendEmail({
      to: "staff@example.com",
      subject: "Invitation",
      html: "<p>INVITE_CODE_STALL_SENTINEL</p>",
      text: "Join Link: https://app.tracknologia.example/register?invite=INVITE_CODE_STALL_SENTINEL",
    });

    expect(result).toEqual({ success: false, reason: "provider_error" });
    expect(Date.now() - started).toBeLessThan(9_000);

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map(String)
      .join(" ");
    expect(logged).toContain("[Email Error]: SMTP delivery failed (");
    expect(logged).not.toContain(SMTP_PASSWORD);
    expect(logged).not.toContain("INVITE_CODE_STALL_SENTINEL");
  }, 15_000);
});
