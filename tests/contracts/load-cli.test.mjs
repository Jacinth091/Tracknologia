import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
let folder, server, url, mode, requests, statusAttempts;

beforeEach(async () => {
  folder = await mkdtemp(path.resolve("tests/load-cli-"));
  await cp("scripts/load/harness.mjs", path.join(folder, "harness.mjs"));
  await cp("scripts/load/scenarios.mjs", path.join(folder, "scenarios.mjs"));
  await cp("scripts/load/lib", path.join(folder, "lib"), { recursive: true });
  await mkdir(path.join(folder, "outputs"));
  const names = [
    "dashboard-read",
    "tracking-lookup",
    "abuse-burst",
    "race-same-repair",
    "status-change",
  ];
  await writeFile(
    path.join(folder, "profiles.json"),
    JSON.stringify({
      profiles: names.map((name) => ({
        name,
        scenario: name,
        stages: [
          {
            concurrency: name === "status-change" ? 2 : 1,
            durationSec: 0.1,
            rampSec: 0,
          },
        ],
      })),
    }),
  );
  mode = "ok";
  requests = [];
  statusAttempts = 0;
  server = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("content-type", "application/json");
    if (req.url === "/dashboard") {
      res.end("{}");
      return;
    }
    if (req.url.includes("lookup_public_repair")) {
      if (mode === "error") {
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "database offline" }));
        return;
      }
      res.end("[]");
      return;
    }
    if (req.url.includes("check_public_operation_rate_limit")) {
      res.end(JSON.stringify([{ allowed: false }]));
      return;
    }
    if (req.url.includes("create_provider_repair")) {
      res.end(JSON.stringify({ repair_id: "repair" }));
      return;
    }
    if (req.url.includes("change_repair_status")) {
      if (mode === "expected" || mode === "error" || mode === "both-error") {
        statusAttempts += 1;
        // In "expected" mode exactly one request, the second, is rejected, and
        // the first is still in flight when it arrives, so the runner sees one
        // genuine overlap with a successful same-Repair change. Alternating
        // every request instead can leave a rejection with no successful
        // overlap, which the runner correctly counts as unexpected.
        const fail = mode !== "expected" || statusAttempts === 2;
        if (fail) res.statusCode = 400;
        const message =
          mode === "error" ? "database offline" : "INVALID_STATUS_TRANSITION";
        setTimeout(
          () => res.end(fail ? JSON.stringify({ message }) : "{}"),
          15,
        );
        return;
      }
      res.end("{}");
      return;
    }
    if (req.url.startsWith("/rest/v1/repair_status_events")) {
      res.end(
        JSON.stringify([
          { from_status: "IN_PROGRESS", to_status: "WAITING_FOR_PARTS" },
        ]),
      );
      return;
    }
    if (req.url.startsWith("/rest/v1/repairs")) {
      res.end(JSON.stringify({ current_status: "WAITING_FOR_PARTS" }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    path.join(folder, "outputs/fixtures.json"),
    JSON.stringify({
      url,
      owner: {
        userId: "user",
        email: "test@example.test",
        providerSlug: "test",
      },
      repairs: [{ repairId: "repair", trackingCode: "code" }],
    }),
  );
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(folder, { recursive: true, force: true });
});

async function run(args = [], appUrl = "") {
  const env = {
    ...process.env,
    SUPABASE_TEST_URL: url,
    SUPABASE_TEST_ANON_KEY: "anon",
    SUPABASE_TEST_SERVICE_ROLE_KEY: "service",
    SUPABASE_TEST_JWT_SECRET: "secret",
    LOAD_APP_URL: appUrl,
    NEXT_PUBLIC_APP_URL: "",
  };
  try {
    const result = await exec(
      process.execPath,
      [path.join(folder, "harness.mjs"), ...args],
      { env },
    );
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}

async function capture(name) {
  const files = await readdir(path.join(folder, "outputs"));
  const file = files.find((entry) => entry.startsWith(`${name}-`));
  return JSON.parse(await readFile(path.join(folder, "outputs", file), "utf8"));
}

describe("load runner CLI", () => {
  it("fails before any workload if page profiles have no app URL", async () => {
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/LOAD_APP_URL/);
    expect(requests).toHaveLength(0);
  });
  it("selects database scenarios without an app URL", async () => {
    const result = await run(["--scenario", "tracking-lookup"]);
    expect(result.code).toBe(0);
    expect(requests.some((item) => item.includes("lookup_public_repair"))).toBe(
      true,
    );
  });
  it("reaches the configured local page for a selected profile", async () => {
    expect((await run(["--profile", "dashboard-read"], url)).code).toBe(0);
    expect(requests).toContain("/dashboard");
  });
  it.each([
    ["--unknown"],
    ["--profile"],
    ["--scenario"],
    ["--scenario", "unknown"],
    ["--profile", "--scenario", "tracking-lookup"],
    ["--profile", "tracking-lookup", "--scenario", "tracking-lookup"],
  ])("rejects invalid options %j", async (...args) => {
    expect((await run(args)).code).not.toBe(0);
    expect(requests).toHaveLength(0);
  });
  it("fails with retained diagnostics on dependency errors", async () => {
    mode = "error";
    const result = await run(["--profile", "tracking-lookup"]);
    expect(result.code).not.toBe(0);
    expect(
      (await capture("tracking-lookup")).stages[0].summary.errorCount,
    ).toBeGreaterThan(0);
  });
  it("fails when a race has two winners", async () => {
    const result = await run(["--profile", "race-same-repair"]);
    expect(result.code).not.toBe(0);
    expect(
      (await capture("race-same-repair")).stages[0].summary.errorCount,
    ).toBeGreaterThan(0);
  });
  it("counts known status-transition race rejections separately", async () => {
    mode = "expected";
    const result = await run(["--profile", "status-change"]);
    expect(result.code).toBe(0);
    expect(
      (await capture("status-change")).stages[0].summary.expectedRejectionCount,
    ).toBeGreaterThan(0);
  });
  it("fails when both overlapping status changes are rejected", async () => {
    mode = "both-error";
    const result = await run(["--profile", "status-change"]);
    expect(result.code).not.toBe(0);
    expect(
      (await capture("status-change")).stages[0].summary.errorCount,
    ).toBeGreaterThan(0);
  });
  it("fails on unexpected status-change errors", async () => {
    mode = "error";
    const result = await run(["--profile", "status-change"]);
    expect(result.code).not.toBe(0);
    expect(
      (await capture("status-change")).stages[0].summary.errorCount,
    ).toBeGreaterThan(0);
  });
  it("allows deliberate rate limit denials", async () => {
    const result = await run(["--profile", "abuse-burst"]);
    expect(result.code).toBe(0);
    expect(
      (await capture("abuse-burst")).stages[0].summary.deniedCount,
    ).toBeGreaterThan(0);
  });
  it("fails and records a thrown page request", async () => {
    const result = await run(
      ["--profile", "dashboard-read"],
      "http://127.0.0.1:1",
    );
    expect(result.code).not.toBe(0);
    expect(
      (await capture("dashboard-read")).stages[0].summary.errorCount,
    ).toBeGreaterThan(0);
  });
});
