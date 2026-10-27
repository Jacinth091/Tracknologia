import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  cleanupFixture,
  assertSupabaseSuccess,
  createAdminClient,
  createTestUser,
  signInTestUser,
  requireDbConfig,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import {
  createProviderAs,
  submitRepairRequestAs,
  verifiedRepairInput,
  readRepairRequestOutcome,
  opaqueActorKey,
  checkPublicOperationLimit,
} from "./helpers/shared-test-utils";

requireDbConfig();

let adminClient: SupabaseClient;
let serviceClient: SupabaseClient;

beforeAll(() => {
  adminClient = createAdminClient();
  serviceClient = createAdminClient();
});

const password = "TestPassword123!";

// Issue #47 hardening: the invariants already covered for a single concurrent
// pair must survive repeated burst load — the condition the pilot load harness
// (scripts/load/) exercises against a running stack.

describe("Load-stress invariants (burst)", () => {
  it("same-Repair transition bursts never corrupt lifecycle state", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("stress-repair"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure stress Repair Service Modes",
      );

      // Each burst races two transitions on a fresh IN_PROGRESS Repair: the
      // lifecycle only allows one successor from IN_PROGRESS, so the loser
      // must fail as INVALID_STATUS_TRANSITION without corrupting state.
      const repairIds: string[] = [];
      for (let burst = 0; burst < 5; burst += 1) {
        const created = assertSupabaseSuccess(
          await auth.client.rpc("create_provider_repair", {
            p_customer_name: "Stress Repair",
            p_customer_phone: "+63 917 555 0101",
            p_device_type: "Laptop",
            p_reported_problem: "Stress fixture",
            p_service_mode: "DROP_OFF",
          }),
          "create stress Repair",
        );
        const receipt = Array.isArray(created.data)
          ? created.data[0]
          : created.data;
        const repairId = receipt.repair_id;
        repairIds.push(repairId);

        const attempts = await Promise.all([
          auth.client.rpc("change_repair_status", {
            p_repair_id: repairId,
            p_next_status: "WAITING_FOR_PARTS",
          }),
          auth.client.rpc("change_repair_status", {
            p_repair_id: repairId,
            p_next_status: "READY",
          }),
        ]);
        expect(attempts.filter((attempt) => !attempt.error)).toHaveLength(1);
        expect(attempts.filter((attempt) => attempt.error)).toHaveLength(1);
        expect(
          attempts.find((attempt) => attempt.error)?.error?.message,
        ).toMatch(/INVALID_STATUS_TRANSITION/);
      }

      const durable = assertSupabaseSuccess(
        await adminClient
          .from("repairs")
          .select("id, current_status")
          .in("id", repairIds)
          .order("created_at", { ascending: true }),
        "read durable burst Repair status",
      );
      expect(durable.data).toHaveLength(5);
      for (const repair of durable.data ?? []) {
        expect(["WAITING_FOR_PARTS", "READY"]).toContain(repair.current_status);
      }

      const events = assertSupabaseSuccess(
        await adminClient
          .from("repair_status_events")
          .select("repair_id, from_status, to_status")
          .in("repair_id", repairIds)
          .order("created_at", { ascending: true }),
        "read burst Repair events",
      );
      expect(events.data).toHaveLength(10);
      for (const repair of durable.data ?? []) {
        const history = (events.data ?? []).filter(
          (event) => event.repair_id === repair.id,
        );
        expect(history).toHaveLength(2);
        expect(history).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              from_status: null,
              to_status: "IN_PROGRESS",
            }),
            expect.objectContaining({
              from_status: "IN_PROGRESS",
              to_status: repair.current_status,
            }),
          ]),
        );
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("same-Request accept/decline bursts serialize to one durable outcome", async () => {
    const owner = await createTestUser(
      adminClient,
      uniqueEmail("stress-request"),
      password,
    );
    const auth = await signInTestUser(owner.email, password);
    const provider = await createProviderAs(auth.client);

    try {
      assertSupabaseSuccess(
        await auth.client.rpc("set_provider_service_modes", {
          p_service_modes: [{ mode: "DROP_OFF" }],
        }),
        "configure stress Request Service Modes",
      );

      for (let burst = 0; burst < 5; burst += 1) {
        const submitted = assertSupabaseSuccess(
          await submitRepairRequestAs(serviceClient, provider.slug),
          `submit Request for burst ${burst}`,
        );
        const receipt = Array.isArray(submitted.data)
          ? submitted.data[0]
          : submitted.data;
        const request = assertSupabaseSuccess(
          await adminClient
            .from("repair_requests")
            .select("id")
            .eq("reference_code", receipt.reference_code)
            .single(),
          `resolve Request for burst ${burst}`,
        );
        if (!request.data) {
          throw new Error(`Repair Request for burst ${burst} was not created`);
        }
        const requestId = request.data.id;

        const attempts = await Promise.all([
          auth.client
            .rpc("create_repair_from_request", verifiedRepairInput(requestId))
            .then((result) => ({ operation: "accept" as const, result })),
          auth.client
            .rpc("decline_repair_request", { p_request_id: requestId })
            .then((result) => ({ operation: "decline" as const, result })),
        ]);
        const successful = attempts.filter(({ result }) => !result.error);
        const rejected = attempts.filter(({ result }) => result.error);
        expect(successful).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.result.error?.message).toMatch(
          /REQUEST_ALREADY_PROCESSED/,
        );

        const outcome = await readRepairRequestOutcome(adminClient, requestId);
        if (outcome.request.status === "ACCEPTED") {
          expect(successful[0]?.operation).toBe("accept");
          expect(outcome.request.accepted_at).toBeTruthy();
          expect(outcome.request.declined_at).toBeNull();
          expect(outcome.repairs).toHaveLength(1);
          expect(outcome.repairs[0]?.current_status).toBe("IN_PROGRESS");
          expect(outcome.events).toHaveLength(1);
        } else {
          expect(outcome.request.status).toBe("DECLINED");
          expect(successful[0]?.operation).toBe("decline");
          expect(outcome.request.accepted_at).toBeNull();
          expect(outcome.request.declined_at).toBeTruthy();
          expect(outcome.repairs).toHaveLength(0);
          expect(outcome.events).toHaveLength(0);
        }
      }
    } finally {
      await cleanupFixture(adminClient, {
        providerIds: [provider.providerId],
        userIds: [owner.user.id],
      });
    }
  });

  it("public-operation abuse bursts are denied above the durable budget", async () => {
    const actorKey = opaqueActorKey("load-stress-abuse");
    const maxRequests = 5;
    const burstSize = 40;

    const rows = await Promise.all(
      Array.from({ length: burstSize }, () =>
        checkPublicOperationLimit(serviceClient, {
          operation: "tracking_lookup",
          actorKey,
          windowSeconds: 60,
          maxRequests,
          cleanupLimit: 0,
        }).then((result) => {
          assertSupabaseSuccess(result, "consume abuse-burst budget");
          return Array.isArray(result.data) ? result.data[0] : result.data;
        }),
      ),
    );

    expect(rows.filter((row) => row?.allowed)).toHaveLength(maxRequests);
    expect(rows.filter((row) => !row?.allowed)).toHaveLength(
      burstSize - maxRequests,
    );

    const durable = assertSupabaseSuccess(
      await adminClient
        .from("public_operation_rate_limits")
        .select("request_count")
        .eq("operation", "tracking_lookup")
        .eq("actor_key", actorKey)
        .single(),
      "read durable abuse-burst budget",
    );
    expect(durable.data?.request_count).toBe(burstSize);
  });
});
