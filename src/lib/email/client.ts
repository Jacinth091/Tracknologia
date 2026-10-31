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

  try {
    const transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    });
    const info = await transport.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });

    return { success: true, id: info.messageId };
  } catch (error) {
    // Only the SMTP error code: the message can carry the recipient or invite.
    console.error(
      `[Email Error]: SMTP delivery failed (${smtpErrorCode(error)})`,
    );
    return { success: false, reason: "provider_error" };
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
  const html = `
    <div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2 style="color: #111; margin-bottom: 12px;">Team Invitation</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #444;">
        You have been invited to join <strong>${safeShopName}</strong> as staff on Tracknologia.
      </p>
      
      <div style="background-color: #f4f4f5; border-radius: 12px; padding: 16px; margin: 24px 0; border: 1px solid #e4e4e7;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #71717a;">Your Invitation Code:</p>
        <code style="font-family: monospace; font-size: 18px; font-weight: bold; color: #18181b; letter-spacing: 1px;">
          ${escapeHtml(params.inviteCode)}
        </code>
      </div>

      <div style="margin: 28px 0;">
        <a href="${escapeHtml(params.inviteUrl)}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
          Accept Invitation & Join Shop
        </a>
      </div>

      <p style="font-size: 12px; color: #71717a; margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 16px;">
        This invitation link is valid for 7 days. If you did not expect this invitation, you can safely ignore this email.
      </p>
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
