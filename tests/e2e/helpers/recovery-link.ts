/**
 * Pure rules for finding the recovery link in a Supabase recovery email. No
 * I/O and no environment reads here, so the same rules are unit-tested in
 * tests/contracts and used by the E2E mail helper.
 *
 * Supabase's default recovery email links to its own verify endpoint:
 *   <supabase-api>/auth/v1/verify?token=…&type=recovery&redirect_to=<app>/auth/callback?next=/reset-password
 * The credential is redeemed by opening THAT link. The app callback is only the
 * redirect target after verification, so the callback URL alone is not enough.
 */

export type RecoveryLinkExpectation = {
  /** Host (and port) of the local Supabase API, e.g. "127.0.0.1:54321". */
  supabaseHost: string;
  /** Origin of the app under test, e.g. "http://localhost:3000". */
  appOrigin: string;
};

export type MailBody = { html?: string; text?: string };

const ENTITY_DECODINGS: [RegExp, string][] = [
  [/&amp;/g, "&"],
  [/&#39;|&#x27;/gi, "'"],
  [/&quot;/g, '"'],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
];

function decodeEntities(value: string): string {
  return ENTITY_DECODINGS.reduce(
    (decoded, [pattern, replacement]) => decoded.replace(pattern, replacement),
    value,
  );
}

/** Every URL the message offers: href attributes and bare links in text. */
export function candidateUrls(body: MailBody): string[] {
  const html = decodeEntities(body.html ?? "");
  const text = decodeEntities(body.text ?? "");
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
  const bare = [...`${html}\n${text}`.matchAll(/https?:\/\/[^\s"'<>)]+/gi)].map(
    (match) => match[0],
  );
  return [...new Set([...hrefs, ...bare])].filter((url) =>
    /^https?:\/\//i.test(url),
  );
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * True when the URL is the verify link of a recovery email for this stack:
 * our local Supabase host, `/auth/v1/verify`, `type=recovery`, a token, and a
 * `redirect_to` that lands on our `/auth/callback?next=/reset-password`.
 */
export function isRecoveryVerifyLink(
  url: string,
  expected: RecoveryLinkExpectation,
): boolean {
  const link = parseUrl(url);
  if (!link || link.host !== expected.supabaseHost) {
    return false;
  }
  if (link.pathname !== "/auth/v1/verify") {
    return false;
  }
  if (link.searchParams.get("type") !== "recovery") {
    return false;
  }
  if (!link.searchParams.get("token")) {
    return false;
  }

  const redirect = parseUrl(link.searchParams.get("redirect_to") ?? "");
  return (
    redirect !== null &&
    redirect.origin === expected.appOrigin &&
    redirect.pathname === "/auth/callback" &&
    redirect.searchParams.get("next") === "/reset-password"
  );
}

/** The recovery verify link in one message, or null. Never fetches it. */
export function findRecoveryLinkInBody(
  body: MailBody,
  expected: RecoveryLinkExpectation,
): string | null {
  for (const url of candidateUrls(body)) {
    if (isRecoveryVerifyLink(url, expected)) {
      return url;
    }
  }
  return null;
}

/**
 * Safe description of what a message offered, for timeout diagnostics: each
 * link as host + pathname and its `type` value. Tokens, query values other
 * than `type`, and bodies are never included.
 */
export function describeLinks(body: MailBody): string[] {
  return candidateUrls(body).map((url) => {
    const link = parseUrl(url);
    if (!link) {
      return "unparseable link";
    }
    const type = link.searchParams.get("type") ?? "none";
    return `${link.host}${link.pathname} type=${type}`;
  });
}
