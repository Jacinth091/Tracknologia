#!/usr/bin/env node

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEnv } from "./lib/env.mjs";
import {
  createServiceClient,
  createUserClient,
  mintSupabaseJwt,
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

function buildContext(fixtures) {
  const env = resolveEnv();
  const service = createServiceClient(env.url, env.serviceRoleKey);
  const ownerToken = mintSupabaseJwt(fixtures.owner.userId, env.jwtSecret, {
    expiresInSeconds: 3600,
  });
  const owner = createUserClient(env.url, env.anonKey, ownerToken);
  return { env, service, owner, fixtures, appUrl: fixtures.appUrl };
}

async function runProfile(name, profile, ctx) {
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
    stageResults.push({
      config: stage,
      summary: summarize(results),
      raw: results,
    });
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
  for (const { config, summary } of stageResults) {
    const parts = [
      `c=${config.concurrency}`,
      `n=${summary.count}`,
      `p50=${summary.p50}ms`,
      `p95=${summary.p95}ms`,
      `p99=${summary.p99}ms`,
    ];
    if (summary.errorCount > 0) parts.push(`errors=${summary.errorCount}`);
    if (summary.deniedCount > 0) parts.push(`denied=${summary.deniedCount}`);
    console.log(`  ${parts.join("  ")}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const profileArg = args[args.indexOf("--profile") + 1];
  const scenarioArg = args[args.indexOf("--scenario") + 1];

  const fixtures = loadFixtures();
  const ctx = buildContext(fixtures);

  const profiles = JSON.parse(readFileSync(PROFILES_PATH, "utf8")).profiles;

  const toRun = profileArg
    ? profiles.filter((p) => p.name === profileArg)
    : scenarioArg
      ? profiles.filter((p) => p.scenario === scenarioArg)
      : profiles;

  if (toRun.length === 0) {
    console.error(
      `No profiles matched. Available: ${profiles.map((p) => p.name).join(", ")}`,
    );
    process.exit(1);
  }

  for (const profile of toRun) {
    console.log(`Running ${profile.name} (${profile.scenario})...`);
    const stageResults = await runProfile(profile.name, profile, ctx);
    const outName = writeResult(profile.name, stageResults);
    printSummary(profile.name, stageResults);
    console.log(`  wrote ${outName}`);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
