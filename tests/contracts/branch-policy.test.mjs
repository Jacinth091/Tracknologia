import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The promotion gate is Bash, not TypeScript, so the matrix runs the real
// script instead of duplicating its patterns.
function check(base, head) {
  return spawnSync("bash", ["scripts/check-branch-policy.sh", base, head], {
    encoding: "utf8",
  }).status;
}

describe("branch policy", () => {
  it("accepts numeric issue segments of any width", () => {
    for (const head of [
      "feature/9/x",
      "feature/91/x",
      "feature/115/x",
      "feature/1234/x",
    ]) {
      expect(check("staging", head), head).toBe(0);
      expect(check("release/0.2.0", head), head).toBe(0);
    }
  });

  it("rejects nonnumeric or incomplete feature segments", () => {
    for (const head of [
      "feature/abc/x",
      "feature/1abc/x",
      "feature/12-3/x",
      "feature/115",
      "feature/115/",
    ]) {
      expect(check("staging", head), head).toBe(1);
      expect(check("release/0.2.0", head), head).toBe(1);
    }
  });

  it("keeps the maintenance and release sources unchanged", () => {
    for (const head of [
      "fix/thing",
      "hotfix/thing",
      "chore/thing",
      "dependabot/npm/thing",
      "release/0.2.0",
    ]) {
      expect(check("staging", head), head).toBe(0);
    }
    for (const head of [
      "fix/thing",
      "hotfix/thing",
      "chore/thing",
      "dependabot/npm/thing",
    ]) {
      expect(check("release/0.2.0", head), head).toBe(0);
    }
    expect(check("release/0.2.0", "release/0.2.0")).toBe(1);
  });

  it("accepts any source into a feature integration branch", () => {
    expect(check("feature/115/integration", "anything/at-all")).toBe(0);
  });

  it("only allows staging to enter main", () => {
    expect(check("main", "staging")).toBe(0);
    expect(check("main", "feature/115/x")).toBe(1);
    expect(check("main", "release/0.2.0")).toBe(1);
  });

  it("fails closed on unknown targets and missing arguments", () => {
    expect(check("production", "fix/thing")).toBe(1);
    expect(check("", "fix/thing")).toBe(1);
  });
});
