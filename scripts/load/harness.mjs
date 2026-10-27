#!/usr/bin/env node

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolveEnv } from "./lib/env.mjs";
import {
  createServiceClient,
  createUserClient,
  mintSupabaseJwt,
  buildSsrSessionCookie,
} from "./lib/supabase.mjs";
import { runBurst, summarize } from "./lib/pool.mjs";
import * as scenarios from "./scenarios.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "outputs");
const FIXTURES_PATH = path.join(OUTPUT_DIR, "fixtures.json");
const PROFILES_PATH = path.join(__dirname, "profiles.json");

const SCENARIO_MAP = {
  "dashboard-read": scenarios.createDashboardRead,
  "repair-list-search": scenarios.createRepairListSearch,
  "tracking-lookup": scenarios.createTrackingLookup,
  "request-submit": scenarios.createRequestSubmit,
  "status-change": scenarios.createStatusChange,
  "analytics-observation": scenarios.createAnalyticsObservation,
  "abuse-burst": scenarios.createAbuseBurst,
  "race-same-repair": scenarios.createRaceSameRepair,
  "race-same-request": scenarios.createRaceSameRequest,
};

function loadFixtures() {
  try {
    return JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));
  } catch {
    throw new Error(
      `Run seed first (node scripts/load/seed.mjs) to produce ${FIXTURES_PATH}`,
    );
  }
}

function buildContext(fixtures, env) {
  const service = createServiceClient(env.url, env.serviceRoleKey);
  const ownerToken = mintSupabaseJwt(fixtures.owner.userId, env.jwtSecret, {
    expiresInSeconds: 3600,
  });
  const owner = createUserClient(env.url, env.anonKey, ownerToken);
  if (fixtures.url !== env.url)
    throw new Error(
      "Fixtures belong to a different Supabase URL; reseed first",
    );
  const ssrCookie = buildSsrSessionCookie(env.url, ownerToken, {
    id: fixtures.owner.userId,
    email: fixtures.owner.email,
    role: "authenticated",
  });
  return { env, service, owner, fixtures, appUrl: env.appUrl, ssrCookie };
}

async function runProfile(profile, ctx) {
  const createTask = SCENARIO_MAP[profile.scenario];
  if (!createTask) throw new Error(`Unknown scenario: ${profile.scenario}`);

  const stageResults = [];
  for (const stage of profile.stages) {
    const task = createTask(ctx);
    console.log(
      `  stage: concurrency=${stage.concurrency} duration=${stage.durationSec}s ramp=${stage.rampSec}s`,
    );
    const results = await runBurst({
      concurrency: stage.concurrency,
      durationMs: stage.durationSec * 1000,
      rampMs: stage.rampSec * 1000,
      task,
    });
    const summary = summarize(results);
    const passed = summary.count > 0 && summary.errorCount === 0;
    stageResults.push({ config: stage, passed, summary, raw: results });
    if (!passed) break;
  }
  return stageResults;
}

function writeResult(profileName, stageResults) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outName = `${profileName}-${timestamp}.json`;
  rmSync(path.join(OUTPUT_DIR, outName), { force: true });
  writeFileSync(
    path.join(OUTPUT_DIR, outName),
    JSON.stringify({ profile: profileName, stages: stageResults }, null, 2),
  );
  return outName;
}

function printSummary(profileName, stageResults) {
  console.log(`\n=== ${profileName} ===`);
  for (const { config, passed, summary } of stageResults) {
    const parts = [
      passed ? "PASS" : "FAIL",
      `c=${config.concurrency}`,
      `n=${summary.count}`,
      `p50=${summary.p50}ms`,
      `p95=${summary.p95}ms`,
      `p99=${summary.p99}ms`,
    ];
    if (summary.errorCount > 0) parts.push(`errors=${summary.errorCount}`);
    if (summary.deniedCount > 0) parts.push(`denied=${summary.deniedCount}`);
    if (summary.expectedRejectionCount > 0)
      parts.push(`expected-rejections=${summary.expectedRejectionCount}`);
    console.log(`  ${parts.join("  ")}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: { profile: { type: "string" }, scenario: { type: "string" } },
    strict: true,
    allowPositionals: false,
  });
  if (values.profile !== undefined && values.scenario !== undefined) {
    throw new Error("Choose either --profile or --scenario, not both");
  }
  if (values.profile === "" || values.scenario === "") {
    throw new Error("Profile and scenario values cannot be empty");
  }
  const profiles = JSON.parse(readFileSync(PROFILES_PATH, "utf8")).profiles;
  const toRun =
    values.profile !== undefined
      ? profiles.filter((p) => p.name === values.profile)
      : values.scenario !== undefined
        ? profiles.filter((p) => p.scenario === values.scenario)
        : profiles;

  if (toRun.length === 0) {
    throw new Error(
      `No profiles matched. Available: ${profiles.map((p) => p.name).join(", ")}`,
    );
  }
  const env = resolveEnv();
  if (
    !env.appUrl &&
    toRun.some((profile) =>
      ["dashboard-read", "repair-list-search"].includes(profile.scenario),
    )
  ) {
    throw new Error(
      "Set LOAD_APP_URL to a local application URL for page-read profiles",
    );
  }
  const ctx = buildContext(loadFixtures(), env);

  for (const profile of toRun) {
    console.log(`Running ${profile.name} (${profile.scenario})...`);
    const stageResults = await runProfile(profile, ctx);
    const outName = writeResult(profile.name, stageResults);
    printSummary(profile.name, stageResults);
    console.log(`  wrote ${outName}`);
    if (stageResults.some((stage) => !stage.passed)) {
      console.error(
        `Profile ${profile.name} failed; remaining profiles were not run.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
