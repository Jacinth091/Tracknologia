import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The grant lives in a request cookie; the jar stands in for it.
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value === undefined ? undefined : { value: jar.value }),
    set: vi.fn(),
  }),
}));

import {
  createRecoveryGrantCookie,
  hasRecoveryGrant,
  isRecoverySession,
  readSessionClaims,
  RECOVERY_AMR_MAX_AGE_SECONDS,
  RECOVERY_GRANT_TTL_SECONDS,
} from "./recovery-grant";

function issueGrant(userId = "user-1", sessionId = "sess-1"): string {
  const cookie = createRecoveryGrantCookie(userId, sessionId);
  jar.value = cookie.value;
  return cookie.value;
}

beforeEach(() => {
  jar.value = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recovery grant", () => {
  it("accepts a fresh grant for the user and session it was issued to", async () => {
    issueGrant("user-1", "sess-1");

    expect(await hasRecoveryGrant("user-1", "sess-1")).toBe(true);
  });

  it("refuses a grant presented for a different user", async () => {
    issueGrant("user-1", "sess-1");

    expect(await hasRecoveryGrant("user-2", "sess-1")).toBe(false);
  });

  it("refuses a grant copied into a different session", async () => {
    // Session A issued the grant; session B presents the same cookie.
    issueGrant("user-1", "session-A");

    expect(await hasRecoveryGrant("user-1", "session-B")).toBe(false);
  });

  it("refuses when the current session has no id", async () => {
    issueGrant("user-1", "sess-1");

    expect(await hasRecoveryGrant("user-1", undefined)).toBe(false);
  });

  it("refuses when no grant cookie is present", async () => {
    expect(await hasRecoveryGrant("user-1", "sess-1")).toBe(false);
  });

  it("refuses a tampered grant", async () => {
    const value = issueGrant("user-1", "sess-1");
    const last = value.slice(-1);
    jar.value = value.slice(0, -1) + (last === "A" ? "B" : "A");

    expect(await hasRecoveryGrant("user-1", "sess-1")).toBe(false);
  });

  it("refuses a grant once its ten-minute lifetime has passed", async () => {
    vi.useFakeTimers();
    issueGrant("user-1", "sess-1");
    vi.setSystemTime(Date.now() + (RECOVERY_GRANT_TTL_SECONDS + 1) * 1000);

    expect(await hasRecoveryGrant("user-1", "sess-1")).toBe(false);
  });
});

describe("readSessionClaims", () => {
  function tokenWith(payload: object): string {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
  }

  it("reads the payload claims of an access token", () => {
    expect(
      readSessionClaims(tokenWith({ session_id: "sess-1", amr: [] })),
    ).toEqual({ session_id: "sess-1", amr: [] });
  });

  it("returns null for a token that is not three segments", () => {
    expect(readSessionClaims("not-a-jwt")).toBeNull();
    expect(readSessionClaims("")).toBeNull();
  });
});

describe("isRecoverySession", () => {
  const now = Date.parse("2026-10-31T10:00:00.000Z");
  const seconds = (offsetSeconds: number) =>
    Math.floor(now / 1000) + offsetSeconds;

  it("accepts a recent recovery entry in the amr claim", () => {
    expect(
      isRecoverySession(
        { amr: [{ method: "recovery", timestamp: seconds(-5) }] },
        now,
      ),
    ).toBe(true);
  });

  it("refuses a session without a recovery method", () => {
    for (const method of ["password", "otp", "magiclink"]) {
      expect(
        isRecoverySession({ amr: [{ method, timestamp: seconds(0) }] }, now),
      ).toBe(false);
    }
  });

  it("refuses a recovery entry older than the window", () => {
    expect(
      isRecoverySession(
        {
          amr: [
            {
              method: "recovery",
              timestamp: seconds(-RECOVERY_AMR_MAX_AGE_SECONDS - 1),
            },
          ],
        },
        now,
      ),
    ).toBe(false);
  });

  it("tolerates a few seconds of skew but refuses a timestamp well ahead", () => {
    expect(
      isRecoverySession(
        { amr: [{ method: "recovery", timestamp: seconds(30) }] },
        now,
      ),
    ).toBe(true);
    expect(
      isRecoverySession(
        { amr: [{ method: "recovery", timestamp: seconds(120) }] },
        now,
      ),
    ).toBe(false);
  });

  it("refuses missing or malformed claims", () => {
    expect(isRecoverySession(null, now)).toBe(false);
    expect(isRecoverySession({}, now)).toBe(false);
    expect(isRecoverySession({ amr: "recovery" as unknown as [] }, now)).toBe(
      false,
    );
  });
});
