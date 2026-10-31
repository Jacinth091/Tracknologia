/**
 * Reads password recovery mail from the local Supabase Inbucket capture
 * service. Capture is off in the repo default (`[local_smtp] enabled = false`
 * in supabase/config.toml) and switched on only by the E2E workflow, before
 * `supabase start`. The HTTP API is on `[local_smtp] port` (default 54324).
 * Like the destructive fixtures, this must only ever talk to the disposable
 * local stack; the host check below keeps the helper honest.
 *
 * Inbucket v1 API used here:
 *   GET    /api/v1/mailbox/{mailbox}        list message summaries
 *   GET    /api/v1/mailbox/{mailbox}/{id}   one message with its body
 *   DELETE /api/v1/mailbox/{mailbox}        purge a mailbox
 */

const INBUCKET_URL = process.env.E2E_INBUCKET_URL || "http://127.0.0.1:54324";

// The list summary is not relied on for the recipient: the mailbox name (the
// recipient's local part) is the association, and the detail is checked too.
type InbucketSummary = { id: string };
type InbucketMessageDetail = {
  to?: { address: string }[];
  body: { text?: string; html?: string };
};

function assertLocalInbucketUrl(): URL {
  let parsed: URL;
  try {
    parsed = new URL(INBUCKET_URL);
  } catch {
    throw new Error(`Invalid E2E_INBUCKET_URL: "${INBUCKET_URL}"`);
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

/** Inbucket names a mailbox after the recipient's local part. */
function mailboxFor(email: string): string {
  return email.toLowerCase().split("@")[0];
}

export async function purgeRecoveryMailbox(email: string): Promise<void> {
  assertLocalInbucketUrl();
  const url = `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailboxFor(email))}`;
  try {
    await fetch(url, { method: "DELETE" });
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
  assertLocalInbucketUrl();
  const deadline = Date.now() + (options.deadlineMs ?? 20_000);
  const recoveryLinkPattern =
    /https?:\/\/[^\s"'<>]+\/auth\/callback\?next=%?2?F?\/?reset-password[^"'<>\s]+/i;
  const mailbox = encodeURIComponent(mailboxFor(email));

  while (Date.now() < deadline) {
    let summaries: InbucketSummary[];
    try {
      const response = await fetch(
        `${INBUCKET_URL}/api/v1/mailbox/${mailbox}`,
      );
      if (!response.ok) {
        summaries = [];
      } else {
        summaries = (await response.json()) as InbucketSummary[];
      }
    } catch {
      summaries = [];
    }

    // Newest first, so a fresh link wins over an earlier one in the same box.
    for (const summary of [...summaries].reverse()) {
      let detail: InbucketMessageDetail;
      try {
        const response = await fetch(
          `${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${encodeURIComponent(summary.id)}`,
        );
        if (!response.ok) continue;
        detail = (await response.json()) as InbucketMessageDetail;
      } catch {
        continue;
      }

      // When the detail names recipients, the address must be this one.
      const recipients = (detail.to ?? []).map((to) => to.address.toLowerCase());
      if (recipients.length > 0 && !recipients.includes(email.toLowerCase())) {
        continue;
      }

      const raw = [detail.body?.text ?? "", detail.body?.html ?? ""].join("\n");
      const match = raw.match(recoveryLinkPattern);
      if (match) {
        return decodeHtmlEntities(match[0]);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `[E2E fixture] no password recovery email with a /reset-password callback ` +
      `link arrived at ${INBUCKET_URL} for ${email} within ` +
      `${options.deadlineMs ?? 20_000}ms. Is the local Supabase stack's ` +
      "mail capture running ([local_smtp] in supabase/config.toml, enabled " +
      "by the E2E workflow)?",
  );
}
