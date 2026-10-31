/**
 * Reads password recovery mail from the local Supabase mail capture. The E2E
 * stack runs Mailpit (the Supabase CLI's local mail service): capture is off in
 * the repo default (`[local_smtp] enabled = false` in supabase/config.toml) and
 * switched on only by the E2E workflow before `supabase start`. Like the
 * destructive fixtures, this must only ever talk to the disposable local stack;
 * the host check below keeps the helper honest.
 *
 * Mailpit v1 API used here (https://mailpit.axllent.org/docs/api-v1/):
 *   GET    /api/v1/search?query=to:"<address>"  messages[] (ID, To[], Created)
 *   GET    /api/v1/message/{ID}                 Text and HTML bodies
 *   DELETE /api/v1/search?query=to:"<address>"  purge that recipient's mail
 */

const MAILPIT_URL = process.env.E2E_MAILPIT_URL || "http://127.0.0.1:54324";

type MailpitSummary = {
  ID: string;
  To?: { Address: string }[];
  Created?: string;
};
type MailpitSearch = { messages?: MailpitSummary[] };
type MailpitMessage = {
  To?: { Address: string }[];
  Text?: string;
  HTML?: string;
};

function assertLocalMailpitUrl(): URL {
  let parsed: URL;
  try {
    parsed = new URL(MAILPIT_URL);
  } catch {
    throw new Error(`Invalid E2E_MAILPIT_URL: "${MAILPIT_URL}"`);
  }
  const local = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!local.has(parsed.hostname)) {
    throw new Error(
      `E2E mail capture refuses non-local host "${parsed.hostname}". ` +
        "The recovery link must come from a disposable local Supabase stack.",
    );
  }
  return parsed;
}

/** Mailpit's search syntax: the exact recipient, quoted. */
function recipientQuery(email: string): string {
  return encodeURIComponent(`to:"${email.toLowerCase()}"`);
}

export async function purgeRecoveryMailbox(email: string): Promise<void> {
  assertLocalMailpitUrl();
  try {
    await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${recipientQuery(email)}`,
      { method: "DELETE" },
    );
  } catch {
    // Purging is best-effort isolation, not validation.
  }
}

function decodeHtmlEntities(link: string): string {
  return link
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Polls the local mail capture for the newest password recovery email for
 * `email` and returns the recovery callback link it carries. The inbox is
 * only checked for the /auth/callback?next=/reset-password link shape, so a
 * registration confirmation email is never mistaken for it.
 */
export async function findRecoveryLink(
  email: string,
  options: { deadlineMs?: number } = {},
): Promise<string> {
  assertLocalMailpitUrl();
  const deadline = Date.now() + (options.deadlineMs ?? 20_000);
  const recoveryLinkPattern =
    /https?:\/\/[^\s"'<>]+\/auth\/callback\?next=%?2?F?\/?reset-password[^"'<>\s]+/i;

  while (Date.now() < deadline) {
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

    // Newest first, so a fresh link wins over an earlier one.
    const newestFirst = [...summaries].sort(
      (a, b) => Date.parse(b.Created ?? "") - Date.parse(a.Created ?? ""),
    );

    for (const summary of newestFirst) {
      let message: MailpitMessage;
      try {
        const response = await fetch(
          `${MAILPIT_URL}/api/v1/message/${encodeURIComponent(summary.ID)}`,
        );
        if (!response.ok) continue;
        message = (await response.json()) as MailpitMessage;
      } catch {
        continue;
      }

      // The search already filters on the recipient; the message's own To
      // list must agree, so a mis-filtered message is never used.
      const recipients = (message.To ?? []).map((to) =>
        to.Address.toLowerCase(),
      );
      if (recipients.length > 0 && !recipients.includes(email.toLowerCase())) {
        continue;
      }

      const raw = [message.Text ?? "", message.HTML ?? ""].join("\n");
      const match = raw.match(recoveryLinkPattern);
      if (match) {
        return decodeHtmlEntities(match[0]);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `[E2E fixture] no password recovery email with a /reset-password callback ` +
      `link arrived at ${MAILPIT_URL} for ${email} within ` +
      `${options.deadlineMs ?? 20_000}ms. Is the local Supabase stack's ` +
      "mail capture running ([local_smtp] in supabase/config.toml, enabled " +
      "by the E2E workflow)?",
  );
}
