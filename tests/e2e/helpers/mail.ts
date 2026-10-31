/**
 * Reads password recovery mail from the local Supabase Inbucket capture
 * service (supabase/config.toml: `[inbucket] port`, default 54324). Like the
 * destructive fixtures, this must only ever talk to the disposable local
 * stack; recovery links read here are worthless outside it, but the host
 * check below keeps the helper honest.
 */

const INBUCKET_URL = process.env.E2E_INBUCKET_URL || "http://127.0.0.1:54324";

type InbucketSubject = { address: string; personal?: string };
type InbucketMessageSummary = {
  id: string;
  from: InbucketSubject;
  to: InbucketSubject[];
  subject: string;
};
type InbucketMessageView = {
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

/** Inbucket names a mailbox after the recipient's full or local address. */
function mailboxCandidates(email: string): string[] {
  return [email.toLowerCase(), email.toLowerCase().split("@")[0]];
}

export async function purgeRecoveryMailbox(email: string): Promise<void> {
  assertLocalInbucketUrl();
  for (const mailbox of mailboxCandidates(email)) {
    const url = `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}`;
    try {
      await fetch(url, { method: "DELETE" });
    } catch {
      // Purging is best-effort isolation, not validation.
    }
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

  while (Date.now() < deadline) {
    for (const mailbox of mailboxCandidates(email)) {
      const listUrl = `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}`;
      let summaries: InbucketMessageSummary[];
      try {
        const response = await fetch(listUrl);
        if (!response.ok) continue;
        summaries = (await response.json()) as InbucketMessageSummary[];
      } catch {
        continue;
      }

      for (const summary of summaries) {
        const toAddress = (summary.to ?? []).map((s) => s.address).join(",");
        if (!toAddress.toLowerCase().includes(email.toLowerCase())) {
          continue;
        }
        const viewUrl = `${INBUCKET_URL}/api/v1/view/${encodeURIComponent(summary.id)}`;
        let view: InbucketMessageView;
        try {
          const response = await fetch(viewUrl);
          if (!response.ok) continue;
          view = (await response.json()) as InbucketMessageView;
        } catch {
          continue;
        }

        const raw = [view.body?.text ?? "", view.body?.html ?? ""].join("\n");
        const match = raw.match(recoveryLinkPattern);
        if (match) {
          return decodeHtmlEntities(match[0]);
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `[E2E fixture] no password recovery email with a /reset-password callback ` +
      `link arrived at ${INBUCKET_URL} for ${email} within ` +
      `${options.deadlineMs ?? 20_000}ms. Is the local Supabase stack's ` +
      "Inbucket capture running ([inbucket] port in supabase/config.toml)?",
  );
}
