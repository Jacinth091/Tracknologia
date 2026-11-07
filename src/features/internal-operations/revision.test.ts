import { afterEach, describe, expect, it } from "vitest";
import { deploymentRevision } from "./revision";

afterEach(() => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.APP_REVISION;
});

describe("deploymentRevision", () => {
  it("returns a hex SHA from either supported variable", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234";
    expect(deploymentRevision()).toBe("abc1234");

    delete process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.APP_REVISION = "0123456789abcdef";
    expect(deploymentRevision()).toBe("0123456789abcdef");
  });

  it("returns null instead of echoing other environment text", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "=cmd|' /C calc'!A0";
    expect(deploymentRevision()).toBeNull();

    process.env.VERCEL_GIT_COMMIT_SHA = "not-a-sha";
    expect(deploymentRevision()).toBeNull();
  });
});
