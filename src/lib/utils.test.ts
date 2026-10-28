import { describe, expect, it } from "vitest";

import { getSafeInternalRedirectUrl } from "./utils";

describe("getSafeInternalRedirectUrl", () => {
  it("accepts single-leading-slash local paths", () => {
    expect(getSafeInternalRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("/internal")).toBe("/internal");
    expect(getSafeInternalRedirectUrl("/")).toBe("/");
  });

  it("preserves safe query strings and fragments", () => {
    expect(getSafeInternalRedirectUrl("/internal/queue?tab=open")).toBe(
      "/internal/queue?tab=open",
    );
    expect(getSafeInternalRedirectUrl("/repairs?status=READY#top")).toBe(
      "/repairs?status=READY#top",
    );
  });

  it("trims boundary whitespace before accepting", () => {
    expect(getSafeInternalRedirectUrl("  /internal  ")).toBe("/internal");
    expect(getSafeInternalRedirectUrl("\n/dashboard?tab=1\t")).toBe(
      "/dashboard?tab=1",
    );
  });

  it("falls back for missing or non-path values", () => {
    expect(getSafeInternalRedirectUrl(null)).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl(undefined)).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("   ")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("dashboard")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("?redirectTo=/internal")).toBe(
      "/dashboard",
    );
  });

  it("rejects absolute and scheme targets", () => {
    expect(getSafeInternalRedirectUrl("https://evil.example")).toBe(
      "/dashboard",
    );
    expect(getSafeInternalRedirectUrl("http://evil.example/internal")).toBe(
      "/dashboard",
    );
    expect(getSafeInternalRedirectUrl("javascript:alert(1)")).toBe(
      "/dashboard",
    );
  });

  it("rejects protocol-relative and backslash authority tricks", () => {
    expect(getSafeInternalRedirectUrl("//evil.example")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("/\\evil.example")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("/internal\\evil.example")).toBe(
      "/dashboard",
    );
    expect(getSafeInternalRedirectUrl("\\\\evil.example")).toBe("/dashboard");
  });

  it("rejects embedded control characters", () => {
    expect(getSafeInternalRedirectUrl("/\t/evil.example")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("/\n/evil.example")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("/inter\u0000nal")).toBe("/dashboard");
    expect(getSafeInternalRedirectUrl("/internal\u007f")).toBe("/dashboard");
  });

  it("bounds the target length at 2048 characters", () => {
    const boundary = `/${"a".repeat(2047)}`;
    expect(boundary).toHaveLength(2048);
    expect(getSafeInternalRedirectUrl(boundary)).toBe(boundary);

    const oversized = `/${"a".repeat(2048)}`;
    expect(getSafeInternalRedirectUrl(oversized)).toBe("/dashboard");
  });

  it("uses the caller's fallback", () => {
    expect(getSafeInternalRedirectUrl("https://evil.example", "/confirmed")).toBe(
      "/confirmed",
    );
  });
});
