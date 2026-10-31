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
  hasRecentRecoveryRequest,
  hasRecoveryGrant,
  RECOVERY_GRANT_TTL_SECONDS,
  RECOVERY_REQUEST_MAX_AGE_MS,
} from "./recovery-grant";

function issueGrant(userId = "user-1"): string {
  const cookie = createRecoveryGrantCookie(userId);
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
  it("accepts a fresh grant for the user it was issued to", async () => {
    issueGrant("user-1");

    expect(await hasRecoveryGrant("user-1")).toBe(true);
  });

  it("refuses a grant presented for a different user", async () => {
    issueGrant("user-1");

    expect(await hasRecoveryGrant("user-2")).toBe(false);
  });

  it("refuses when no grant cookie is present", async () => {
    expect(await hasRecoveryGrant("user-1")).toBe(false);
  });

  it("refuses a tampered grant", async () => {
    const value = issueGrant("user-1");
    const last = value.slice(-1);
    jar.value = value.slice(0, -1) + (last === "A" ? "B" : "A");

    expect(await hasRecoveryGrant("user-1")).toBe(false);
  });

  it("refuses a grant once its ten-minute lifetime has passed", async () => {
    vi.useFakeTimers();
    issueGrant("user-1");
    vi.setSystemTime(Date.now() + (RECOVERY_GRANT_TTL_SECONDS + 1) * 1000);

    expect(await hasRecoveryGrant("user-1")).toBe(false);
  });
});

describe("hasRecentRecoveryRequest", () => {
  const now = Date.parse("2026-10-31T10:00:00.000Z");

  it("needs a recovery_sent_at timestamp", () => {
    expect(hasRecentRecoveryRequest({}, now)).toBe(false);
  });

  it("accepts a request sent within the last hour", () => {
    const sent = new Date(now - 5 * 60 * 1000).toISOString();

    expect(hasRecentRecoveryRequest({ recovery_sent_at: sent }, now)).toBe(
      true,
    );
  });

  it("refuses a request older than the maximum age", () => {
    const sent = new Date(now - RECOVERY_REQUEST_MAX_AGE_MS - 1).toISOString();

    expect(hasRecentRecoveryRequest({ recovery_sent_at: sent }, now)).toBe(
      false,
    );
  });

  it("tolerates a few seconds of clock skew ahead of the app server", () => {
    const thirtySecondsAhead = new Date(now + 30 * 1000).toISOString();

    expect(
      hasRecentRecoveryRequest({ recovery_sent_at: thirtySecondsAhead }, now),
    ).toBe(true);
  });

  it("refuses a timestamp further in the future than the skew allowance", () => {
    const twoMinutesAhead = new Date(now + 2 * 60 * 1000).toISOString();

    expect(
      hasRecentRecoveryRequest({ recovery_sent_at: twoMinutesAhead }, now),
    ).toBe(false);
  });

  it("refuses an unreadable timestamp", () => {
    expect(
      hasRecentRecoveryRequest({ recovery_sent_at: "not-a-date" }, now),
    ).toBe(false);
  });
});
