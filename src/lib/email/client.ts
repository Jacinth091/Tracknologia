import "server-only";
import { createTransport } from "nodemailer";
import { getServerConfig } from "@/lib/config/server";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export type EmailDeliveryResult =
  | { success: true; id?: string }
  | { success: false; reason: "provider_error" | "EMAIL_DISABLED" };

// Bounds the invite Server Action, so the one-time Copy Link still returns when SMTP stalls.
const SMTP_CONNECTION_TIMEOUT_MS = 5_000;
const SMTP_GREETING_TIMEOUT_MS = 5_000;
const SMTP_SOCKET_TIMEOUT_MS = 5_000;
const SMTP_SEND_DEADLINE_MS = 8_000;

export async function sendEmail(
  params: SendEmailParams,
): Promise<EmailDeliveryResult> {
  const config = getServerConfig();
  const from = params.from || config.email.from;

  if (config.email.isDevLogger) {
    console.log("----------------------------------------");
    console.log("[DEV EMAIL LOGGER] (No SMTP_HOST configured)");
    console.log(
      `To: ${Array.isArray(params.to) ? params.to.join(", ") : params.to}`,
    );
    console.log(`From: ${from}`);
    console.log(`Subject: ${params.subject}`);
    console.log("----------------------------------------");
    return { success: true, id: "dev-mock-id" };
  }

  // Production without SMTP settings: the pilot shares invite links by Copy
  // Link. Log nothing here, because the message may carry an invite URL or code.
  const smtp = config.email.smtp;
  if (!smtp) {
    return { success: false, reason: "EMAIL_DISABLED" };
  }

  // Port 465 is implicit TLS. Every other port must upgrade with STARTTLS
  // before AUTH, so the App Password never crosses an unencrypted connection.
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    auth: { user: smtp.user, pass: smtp.password },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(new Error("SMTP send deadline exceeded"), {
          code: "ETIMEDOUT",
        }),
      );
    }, SMTP_SEND_DEADLINE_MS);
  });

  try {
    const sending = transport.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    // If the deadline wins, this send rejects later with no other handler.
    sending.catch(() => undefined);
    const info = await Promise.race([sending, deadline]);

    return { success: true, id: info.messageId };
  } catch (error) {
    // Only the SMTP error code: the message can carry the recipient or invite.
    console.error(
      `[Email Error]: SMTP delivery failed (${smtpErrorCode(error)})`,
    );
    return { success: false, reason: "provider_error" };
  } finally {
    clearTimeout(timer);
    transport.close();
  }
}

function smtpErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendStaffInviteEmail(params: {
  to: string;
  shopName: string;
  inviteCode: string;
  inviteUrl: string;
}) {
  const safeShopName = escapeHtml(params.shopName);
  const subject = `You're invited to join ${params.shopName} on Tracknologia`;
  // Email clients ignore CSS variables and external stylesheets, so the brand
  // tokens from src/app/globals.css (:root) are inlined as hex values here.
  const html = `
    <div style="background-color: #faf8f3; padding: 32px 16px; font-family: Figtree, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #141414;">
      <div style="max-width: 560px; margin: 0 auto;">
        <p style="margin: 0 0 20px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #141414;">
          Tracknologia<span style="color: #ffc72c;">.</span>
        </p>

        <div style="background-color: #ffffff; border: 1px solid #e9e4d8; border-radius: 10px; padding: 28px 24px;">
          <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #141414;">Team invitation</h1>
          <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #45403a;">
            You have been invited to join <strong style="color: #141414;">${safeShopName}</strong> as staff on Tracknologia.
          </p>

          <div style="background-color: #f3f0e8; border: 1px solid #e9e4d8; border-radius: 10px; padding: 16px; margin: 24px 0;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b6455;">Your invitation code</p>
            <code style="font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 18px; font-weight: 700; letter-spacing: 1px; color: #141414;">${escapeHtml(params.inviteCode)}</code>
          </div>

          <a href="${escapeHtml(params.inviteUrl)}" style="display: inline-block; background-color: #ffc72c; color: #141414; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Accept invitation &amp; join shop
          </a>
        </div>

        <p style="margin: 20px 4px 0 4px; font-size: 12px; line-height: 1.5; color: #6b6455;">
          This invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const text = `
You're invited to join ${params.shopName} on Tracknologia!

Invitation Code: ${params.inviteCode}
Join Link: ${params.inviteUrl}

This link is valid for 7 days.
  `.trim();

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
  });
}
