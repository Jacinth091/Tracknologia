import { describe, expect, it } from "vitest";

import {
  describeLinks,
  findRecoveryLinkInBody,
  type RecoveryLinkExpectation,
} from "../e2e/helpers/recovery-link";

const expected: RecoveryLinkExpectation = {
  supabaseHost: "127.0.0.1:54321",
  appOrigin: "http://localhost:3000",
};

const CALLBACK =
  "http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%3Fnext%3D%2Freset-password";

// A representative Supabase default recovery email: the button links to the
// verify endpoint, and the query separators are HTML-escaped as `&amp;`.
const DEFAULT_RECOVERY_HTML = `
<h2>Reset Password</h2>
<p>Follow this link to reset the password for your user:</p>
<p><a href="http://127.0.0.1:54321/auth/v1/verify?token=abc123def&amp;type=recovery&amp;redirect_to=${CALLBACK}">Reset Password</a></p>
`;

describe("recovery email link extraction", () => {
  it("returns the Supabase verify link from a default recovery email", () => {
    const link = findRecoveryLinkInBody(
      { html: DEFAULT_RECOVERY_HTML },
      expected,
    );

    expect(link).not.toBeNull();
    expect(link).toContain("http://127.0.0.1:54321/auth/v1/verify?");
    // Entities are decoded, so the query separators are real `&`.
    expect(link).toContain("token=abc123def&type=recovery&redirect_to=");
  });

  it("also finds the verify link in the plain-text part", () => {
    const text = `Reset your password: http://127.0.0.1:54321/auth/v1/verify?token=abc123def&type=recovery&redirect_to=${CALLBACK}`;

    expect(findRecoveryLinkInBody({ text }, expected)).toContain(
      "/auth/v1/verify",
    );
  });

  it("ignores a bare app callback link, which is only a redirect target", () => {
    const text =
      "http://localhost:3000/auth/callback?code=some-code&next=/reset-password";

    expect(findRecoveryLinkInBody({ text }, expected)).toBeNull();
  });

  it("ignores a verify link on a non-local host", () => {
    const html = `<a href="https://evil.example/auth/v1/verify?token=abc&type=recovery&redirect_to=${CALLBACK}">x</a>`;

    expect(findRecoveryLinkInBody({ html }, expected)).toBeNull();
  });

  it("ignores a verify link of another email type", () => {
    const html = `<a href="http://127.0.0.1:54321/auth/v1/verify?token=abc&type=signup&redirect_to=${CALLBACK}">Confirm</a>`;

    expect(findRecoveryLinkInBody({ html }, expected)).toBeNull();
  });

  it("ignores a verify link that does not return to the reset callback", () => {
    const html = `<a href="http://127.0.0.1:54321/auth/v1/verify?token=abc&type=recovery&redirect_to=${encodeURIComponent("http://localhost:3000/dashboard")}">x</a>`;

    expect(findRecoveryLinkInBody({ html }, expected)).toBeNull();
  });

  it("describes links for diagnostics without tokens or full URLs", () => {
    const described = describeLinks({ html: DEFAULT_RECOVERY_HTML });

    // The callback sits only inside the encoded redirect_to, so it is not a
    // separate link; the one offered link is the verify endpoint.
    expect(described).toEqual(["127.0.0.1:54321/auth/v1/verify type=recovery"]);
    expect(described.join(" ")).not.toContain("abc123def");
  });

  it("reports no links for a message with no URLs", () => {
    expect(describeLinks({ text: "Nothing to click here." })).toEqual([]);
    expect(findRecoveryLinkInBody({ text: "" }, expected)).toBeNull();
  });
});
