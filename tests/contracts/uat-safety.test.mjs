import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const env = {
  ...process.env,
  SUPABASE_TEST_URL: "http://127.0.0.1:54321",
  SUPABASE_TEST_ANON_KEY: "dummy",
  SUPABASE_TEST_SERVICE_ROLE_KEY: "dummy",
  SUPABASE_TEST_JWT_SECRET: "dummy",
};

it("rejects remote Supabase before contacting it", async () => {
  await expect(
    run(process.execPath, ["scripts/uat/seed.mjs"], {
      env: { ...env, SUPABASE_TEST_URL: "https://example.supabase.co" },
    }),
  ).rejects.toThrow(/Refusing to run/);
});

it("refuses a legacy manifest instead of deleting broadly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "uat-manifest-"));
  const manifest = path.join(dir, "old.json");
  try {
    await writeFile(
      manifest,
      JSON.stringify({ runId: "12345678", personas: [] }),
    );
    await expect(
      run(process.execPath, ["scripts/uat/seed.mjs", "--cleanup", manifest], {
        env,
      }),
    ).rejects.toThrow(/Invalid or legacy manifest/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
