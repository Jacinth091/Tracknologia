/**
 * Reads password recovery mail from the local Supabase mail capture. The E2E
 * stack runs Mailpit (the Supabase CLI's local mail service): capture is off in
 * the repo default (`[local_smtp] enabled = false` in supabase/config.toml) and
 * switched on only by the E2E workflow before `supabase start`. Like the
 * destructive fixtures, this must only ever talk to the disposable local stack;
 * the host checks below keep the helper honest.
 *
 * Mailpit v1 API used here (https://mailpit.axllent.org/docs/api-v1/):
 *   GET    /api/v1/search?query=to:"<address>"  messages[] (ID, To[], Created)
 *   GET    /api/v1/message/{ID}                 Subject, To, Text, HTML
 *   DELETE /api/v1/search?query=to:"<address>"  purge that recipient's mail
 *
 * The link rules live in recovery-link.ts. The recovery email links to
 * Supabase's own verify endpoint, which the spec opens; the spec never builds
 * a callback URL itself.
 */

import {
  describeLinks,
  findRecoveryLinkInBody,
  type MailBody,
  type RecoveryLinkExpectation,
} from "./recovery-link";

const MAILPIT_URL = process.env.E2E_MAILPIT_URL || "http://127.0.0.1:54324";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type MailpitSummary = {
  ID: string;
  To?: { Address: string }[];
  Created?: string;
};
type MailpitSearch = { messages?: MailpitSummary[] };
// Mailpit returns the detail with capitalized fields.
type MailpitMessage = { Subject?: string; Text?: string; HTML?: string };
// The shape the link rules read: lowercase bodies, plus the subject for
// diagnostics.
type MailMessage = MailBody & { subject?: string };

function toMailMessage(message: MailpitMessage): MailMessage {
  return {
    subject: message.Subject,
    text: message.Text,
    html: message.HTML,
  };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalUrl(label: string, value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid ${label}: "${value}"`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `E2E mail capture refuses non-local host "${parsed.hostname}" for ${label}. ` +
        "The recovery link must come from a disposable local Supabase stack.",
    );
  }
  return parsed;
}

function assertLocalMailpitUrl(): URL {
  return assertLocalUrl("E2E_MAILPIT_URL", MAILPIT_URL);
}

/** The local Supabase API host a recovery verify link must point at. */
function expectation(): RecoveryLinkExpectation {
  const supabase = assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  return { supabaseHost: supabase.host, appOrigin: new URL(APP_URL).origin };
}

/** Mailpit's search syntax: the exact recipient, quoted. */
function recipientQuery(email: string): string {
  return encodeURIComponent(`to:"${email.toLowerCase()}"`);
}

export async function purgeRecoveryMailbox(email: string): Promise<void> {
  assertLocalMailpitUrl();
  try {
    await fetch(`${MAILPIT_URL}/api/v1/search?query=${recipientQuery(email)}`, {
      method: "DELETE",
    });
  } catch {
    // Purging is best-effort isolation, not validation.
  }
}

/** The recipient's messages, newest first, with their bodies. */
async function fetchRecipientMessages(email: string): Promise<MailMessage[]> {
  let summaries: MailpitSummary[] = [];
  try {
    const response = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${recipientQuery(email)}`,
    );
    if (response.ok) {
      const body = (await response.json()) as MailpitSearch;
      summaries = body.messages ?? [];
    }
  } catch {
    summaries = [];
  }

  const newestFirst = [...summaries].sort(
    (a, b) => Date.parse(b.Created ?? "") - Date.parse(a.Created ?? ""),
  );

  const messages: MailMessage[] = [];
  for (const summary of newestFirst) {
    try {
      const response = await fetch(
        `${MAILPIT_URL}/api/v1/message/${encodeURIComponent(summary.ID)}`,
      );
      if (!response.ok) continue;
      const detail = (await response.json()) as MailpitMessage;
      messages.push(toMailMessage(detail));
    } catch {
      continue;
    }
  }
  return messages;
}

/**
 * Safe timeout diagnostic: how many messages reached the recipient, their
 * subjects, and for each offered link only host + pathname and `type`. Tokens,
 * full URLs and bodies are never printed.
 */
function diagnose(
  email: string,
  messages: MailMessage[],
  deadlineMs: number,
): string {
  const lines = messages.map((message, index) => {
    const links = describeLinks(message);
    const linkText = links.length > 0 ? links.join("; ") : "no links";
    return `  [${index + 1}] subject "${message.subject ?? ""}" — ${linkText}`;
  });
  return (
    `[E2E fixture] no recovery verify link for ${email} within ${deadlineMs}ms. ` +
    `Messages for the recipient: ${messages.length}.` +
    (lines.length > 0 ? `\n${lines.join("\n")}` : "") +
    "\nExpected a Supabase /auth/v1/verify link with type=recovery whose " +
    `redirect_to is ${APP_URL}/auth/callback?next=/reset-password. ` +
    "Check that mail capture is running ([local_smtp], enabled by the E2E workflow)."
  );
}

/**
 * Polls the local mail capture for the newest password recovery email for
 * `email` and returns its Supabase verify link. The spec opens that link with
 * the page that requested the reset, so Supabase can verify the token and
 * redirect to the app callback. The link is not fetched here.
 */
export async function findRecoveryLink(
  email: string,
  options: { deadlineMs?: number } = {},
): Promise<string> {
  assertLocalMailpitUrl();
  const expected = expectation();
  const deadlineMs = options.deadlineMs ?? 20_000;
  const deadline = Date.now() + deadlineMs;
  let lastMessages: MailMessage[] = [];

  while (Date.now() < deadline) {
    lastMessages = await fetchRecipientMessages(email);
    for (const message of lastMessages) {
      const link = findRecoveryLinkInBody(message, expected);
      if (link) {
        return link;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(diagnose(email, lastMessages, deadlineMs));
}
