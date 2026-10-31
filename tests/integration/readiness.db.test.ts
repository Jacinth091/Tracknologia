import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Mock boundary, stated plainly: only the public-operation client factory is
// replaced. The app's server config is not loaded here, so the probe runs
// against a real service-role client built from the test environment. Each
// case chooses its client through `shared.client`.
const shared = vi.hoisted(() => ({
  client: undefined as unknown,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: async () => shared.client,
}));

import { checkReadiness } from "@/features/internal-operations";

import {
  createAdminClient,
  requireDbConfig,
  testServiceKey,
} from "./helpers/supabase-test-context";

requireDbConfig();

const DB_CASE_TIMEOUT_MS = 10_000;

describe("Public readiness probe against the real database", () => {
  it(
    "reports healthy when the real service-role client reaches the database",
    async () => {
      shared.client = createAdminClient();

      await expect(checkReadiness()).resolves.toBe("healthy");
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "reports unavailable when the client points at an unreachable URL",
    async () => {
      // Port 9 on loopback is closed, so the round trip fails at transport level.
      shared.client = createClient("http://127.0.0.1:9", testServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      await expect(checkReadiness()).resolves.toBe("unavailable");
    },
    DB_CASE_TIMEOUT_MS,
  );
});
