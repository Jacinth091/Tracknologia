import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createAdminClient, testUrl } from "./helpers/supabase-test-context";

const run = promisify(execFile);
type Manifest = {
  users: { id: string; email: string }[];
  providers: { id: string; slug: string }[];
  personas: { persona: string; providerSlug: string; newStaffEmail?: string }[];
};

describe("UAT pack", () => {
  it("seeds complete personas and cleans only the specified run", async () => {
    const url = new URL(testUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error(
        "UAT smoke test requires a disposable local Supabase stack",
      );
    }
    const admin = createAdminClient();
    const paths: string[] = [];
    const seed = async () => {
      const { stdout } = await run(process.execPath, ["scripts/uat/seed.mjs"]);
      const path = stdout.match(/Manifest:\s*(.+)/)?.[1]?.trim();
      if (!path) throw new Error("Seed did not return a manifest path");
      paths.push(path);
      return JSON.parse(await readFile(path, "utf8")) as Manifest;
    };
    const cleanup = (path: string) =>
      run(process.execPath, ["scripts/uat/seed.mjs", "--cleanup", path]);
    try {
      const first = await seed();
      const second = await seed();
      expect(first.personas.map((item) => item.persona)).toEqual([
        "Shop Owner (one-person Shop)",
        "Shop Owner (multi-Staff Shop)",
        "Independent Provider",
        "Shop Owner (closed intake)",
      ]);
      expect(first.users).toHaveLength(6);
      const providers = await admin
        .from("providers")
        .select("slug, provider_type, accepting_requests")
        .in(
          "id",
          first.providers.map((item) => item.id),
        );
      expect(providers.error).toBeNull();
      expect(providers.data).toHaveLength(4);
      expect(
        providers.data?.find(
          (item) => item.slug === first.personas[3]?.providerSlug,
        ),
      ).toMatchObject({ provider_type: "SHOP", accepting_requests: false });
      const repairs = await admin
        .from("repairs")
        .select("current_status")
        .in(
          "provider_id",
          first.providers.map((item) => item.id),
        );
      expect(repairs.error).toBeNull();
      expect(new Set(repairs.data?.map((item) => item.current_status))).toEqual(
        new Set([
          "IN_PROGRESS",
          "WAITING_FOR_PARTS",
          "AWAITING_APPROVAL",
          "READY",
          "COMPLETED",
        ]),
      );
      const requests = await admin
        .from("repair_requests")
        .select("status")
        .in(
          "provider_id",
          first.providers.map((item) => item.id),
        );
      expect(requests.error).toBeNull();
      expect(new Set(requests.data?.map((item) => item.status))).toEqual(
        new Set(["SUBMITTED", "ACCEPTED", "DECLINED"]),
      );
      const independent = first.personas.find(
        (item) => item.persona === "Independent Provider",
      );
      const provider = await admin
        .from("providers")
        .select("id, provider_type, service_area, public_address")
        .eq("slug", independent?.providerSlug)
        .single();
      expect(provider.error).toBeNull();
      expect(provider.data).toMatchObject({
        provider_type: "INDEPENDENT",
        service_area: "Marikina, Antipolo, Cainta",
        public_address: null,
      });
      const modes = await admin
        .from("provider_service_modes")
        .select("mode")
        .eq("provider_id", provider.data?.id);
      expect(modes.error).toBeNull();
      expect(modes.data?.map((row) => row.mode).sort()).toEqual([
        "HOME_SERVICE",
        "MEETUP",
      ]);
      expect(first.personas[1]?.newStaffEmail).toMatch(
        /^uat\.invite\.new\..+@uat\.test$/,
      );

      const tamperedPath = `${paths[0]}.tampered`;
      await writeFile(
        tamperedPath,
        JSON.stringify({ ...first, users: [...first.users, second.users[0]] }),
      );
      try {
        await expect(cleanup(tamperedPath)).rejects.toThrow();
      } finally {
        await rm(tamperedPath, { force: true });
      }
      await cleanup(paths[0]);
      await cleanup(paths[0]);
      const goneProviders = await admin
        .from("providers")
        .select("id")
        .in(
          "id",
          first.providers.map((item) => item.id),
        );
      expect(goneProviders.error).toBeNull();
      expect(goneProviders.data).toHaveLength(0);
      for (const user of first.users) {
        const result = await admin.auth.admin.getUserById(user.id);
        expect(result.data.user).toBeNull();
      }
      const remaining = await admin
        .from("providers")
        .select("id")
        .in(
          "id",
          second.providers.map((item) => item.id),
        );
      expect(remaining.error).toBeNull();
      expect(remaining.data).toHaveLength(second.providers.length);
      const members = await admin
        .from("provider_memberships")
        .select("user_id")
        .in(
          "user_id",
          second.users.map((item) => item.id),
        );
      expect(members.error).toBeNull();
      expect(members.data).toHaveLength(second.users.length);
      for (const user of second.users) {
        const result = await admin.auth.admin.getUserById(user.id);
        expect(result.error).toBeNull();
        expect(result.data.user?.email).toBe(user.email);
      }
    } finally {
      for (const path of paths) {
        await cleanup(path);
        await rm(path, { force: true });
      }
    }
  }, 180_000);
});
