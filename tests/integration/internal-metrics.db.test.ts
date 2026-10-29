import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  assertSupabaseSuccess,
  createAdminClient,
  createAnonClient,
  createTestUser,
  requireDbConfig,
  signInTestUser,
  testUrl,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import { expectRpcPermissionDenied } from "./helpers/shared-test-utils";
import { runLocalSql, sqlUuidLiteral } from "../helpers/local-postgres";
import {
  buildValidationMetrics,
  metricsRowSchema,
} from "@/features/internal-operations/metrics";

// Direct SQL proof of the O2 aggregate metrics. The RPC is one set-based
// statement, so N+1 is structurally impossible; EXPLAIN ANALYZE under a seeded
// pilot-shaped row count proves the plan shape and its magnitude.
//
// One psql session runs the whole script inside a REPEATABLE READ transaction
// that ends with ROLLBACK, so no fixture persists. The window sits at fixed
// future instants (Manila days 2026-11-01..2026-11-03) no other suite touches,
// so the exact absolute counts are deterministic.

requireDbConfig();

const admin = createAdminClient();
const DB_CASE_TIMEOUT_MS = 120_000;

function ts(instant: string): string {
  return `'${instant}'::timestamptz`;
}

// Manila boundaries: d1 starts 2026-10-31T16:00Z; AFTER is the exclusive end.
const WINDOW = {
  start: "2026-10-31T16:00:00.000Z",
  end: "2026-11-03T16:00:00.000Z",
};
const BEFORE = "2026-10-31T14:00:00.000Z";
const BEFORE_LATE = "2026-10-31T15:59:00.000Z"; // excluded: 23:59 PHT Oct 31
const D1A = "2026-10-31T16:00:00.000Z"; // 00:00 PHT Nov 1, inclusive edge
const D1B = "2026-10-31T17:00:00.000Z";
const D2A = "2026-11-01T16:00:00.000Z"; // 00:00 PHT Nov 2
const D2B = "2026-11-01T17:00:00.000Z";
const D3A = "2026-11-02T16:00:00.000Z"; // 00:00 PHT Nov 3
const D3B = "2026-11-02T17:00:00.000Z";
const AFTER = "2026-11-03T16:00:00.000Z"; // 00:00 PHT Nov 4, exclusive end

const fresh = () => randomUUID();
const P_SHOP1 = { id: fresh(), slug: `metrics-a-${randomUUID().slice(0, 8)}` };
const P_SHOP2 = { id: fresh(), slug: `metrics-b-${randomUUID().slice(0, 8)}` };
const P_INDEP1 = { id: fresh(), slug: `metrics-c-${randomUUID().slice(0, 8)}` };
const P_SHOP3 = { id: fresh(), slug: `metrics-d-${randomUUID().slice(0, 8)}` };
const P_INDEP2 = { id: fresh(), slug: `metrics-e-${randomUUID().slice(0, 8)}` };

// TN-[0-9]{4}-[A-F0-9]{10} and TRK-[A-F0-9]{24}: a UUID hex without dashes is
// a safe deterministic source for both.
const uuidHex = (id: string, length: number): string =>
  id.replace(/-/g, "").slice(0, length).toUpperCase();

const DECISION_MEAN_SECONDS = 107280; // mean of 172800/90000/82800/180000/10800

function providerSql(p: typeof P_SHOP1, type: string, when: string): string {
  const label = p.slug.slice(-8);
  return `INSERT INTO public.providers (id, provider_type, display_name, slug, created_at) VALUES (${sqlUuidLiteral(p.id)}, '${type}', 'Metrics P ${label}', '${p.slug}', ${ts(when)});`;
}

function repairFixture(options: {
  id: string;
  providerId: string;
  requestId?: string;
  origin: string;
  created: string;
  status: string;
  completed?: string;
}): string {
  const ticket = `TN-4100-${uuidHex(options.id, 10)}`;
  return [
    "INSERT INTO public.repairs (id, provider_id, repair_request_id, origin, ticket_number, tracking_code, customer_name, customer_phone, device_type, reported_problem, current_status, created_at, created_by_user_id, completed_at) VALUES (",
    `${sqlUuidLiteral(options.id)}, ${sqlUuidLiteral(options.providerId)},`,
    options.requestId
      ? `${sqlUuidLiteral(options.requestId)}, '${options.origin}',`
      : `NULL, '${options.origin}',`,
    `'${ticket}', 'TRK-${uuidHex(options.id, 24)}', 'Metrics Customer ${uuidHex(options.id, 6)}', '+639170000000', 'Phone', 'Metrics reported problem', '${options.status}', ${ts(options.created)}, ${sqlUuidLiteral(creatorId)},`,
    options.completed ? `${ts(options.completed)}` : "NULL",
    ");",
  ].join(" ");
}

function requestFixture(options: {
  id: string;
  providerId: string;
  submitted: string;
  accepted?: string;
  acceptedBy?: string;
  declined?: string;
  declinedBy?: string;
}): string {
  const status = options.accepted
    ? "ACCEPTED"
    : options.declined
      ? "DECLINED"
      : "SUBMITTED";
  return [
    "INSERT INTO public.repair_requests (id, provider_id, reference_code, customer_name, customer_phone, device_type, reported_problem, status, submitted_at, accepted_at, accepted_by_user_id, declined_at, declined_by_user_id) VALUES (",
    `${sqlUuidLiteral(options.id)}, ${sqlUuidLiteral(options.providerId)}, 'REQ-${options.id.replace(/-/g, "").slice(0, 16).toUpperCase()}',`,
    `'Metrics Request ${options.id.slice(0, 8)}', '+639180000000', 'Phone', 'Metrics request problem', '${status}',`,
    `${ts(options.submitted)},`,
    `${options.accepted ? `${ts(options.accepted)}, ${sqlUuidLiteral(options.acceptedBy ?? options.id)}` : "NULL, NULL"},`,
    `${options.declined ? `${ts(options.declined)}, ${sqlUuidLiteral(options.declinedBy ?? options.id)}` : "NULL, NULL"}`,
    ");",
  ].join(" ");
}

function metricsSql(
  operatorId: string,
  marker: string,
  window: { start: string; end: string },
): string {
  return `SELECT '${marker} ' || coalesce((SELECT json_agg(row_to_json(s))::text FROM public.get_internal_validation_metrics(${sqlUuidLiteral(operatorId)}, ${ts(window.start)}, ${ts(window.end)}) AS s), '[]');`;
}

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: "internal metrics integration operator",
    }),
    `provision ${prefix} operator`,
  );
  return created.user.id;
}

// Repairs require created_by_user_id; the creator is any real user and
// carries no membership, so it does not affect any metric. It is assigned in
// the fixture test before the SQL script is built.
let creatorId = "";

type MetricsRowJson = {
  dimension: string;
  bucket: string;
  row_count: number;
  interval_seconds: number | null;
};

function readMarker(output: string, marker: string): MetricsRowJson[] {
  const line = output
    .split("\n")
    .find((entry) => entry.startsWith(`${marker} `));
  if (line === undefined) {
    throw new Error(`The snapshot script produced no ${marker} output`);
  }
  return JSON.parse(line.slice(marker.length + 1)) as MetricsRowJson[];
}

function count(
  rows: MetricsRowJson[],
  dimension: string,
  bucket: string,
): number {
  return (
    rows.find((row) => row.dimension === dimension && row.bucket === bucket)
      ?.row_count ?? 0
  );
}

describe("get_internal_validation_metrics grants", () => {
  it(
    "denies anon and authenticated, and rechecks the operator mapping",
    async () => {
      // Function privilege: only service_role may EXECUTE.
      expectRpcPermissionDenied(
        await createAnonClient().rpc("get_internal_validation_metrics", {
          p_operator_user_id: randomUUID(),
          p_window_start: WINDOW.start,
          p_window_end: WINDOW.end,
        }),
      );

      const user = await createTestUser(
        admin,
        uniqueEmail("metrics-auth-denial"),
      );
      const { client: authed } = await signInTestUser(
        user.email,
        user.password,
      );
      expectRpcPermissionDenied(
        await authed.rpc("get_internal_validation_metrics", {
          p_operator_user_id: randomUUID(),
          p_window_start: WINDOW.start,
          p_window_end: WINDOW.end,
        }),
      );

      // Service role can execute, but an unknown operator mapping fails
      // closed inside the function.
      const unknownOperator = await admin.rpc(
        "get_internal_validation_metrics",
        {
          p_operator_user_id: randomUUID(),
          p_window_start: WINDOW.start,
          p_window_end: WINDOW.end,
        },
      );
      expect(unknownOperator.error).toMatchObject({
        message: expect.stringMatching(/internal operator access required/i),
      });

      // A mapping with enabled=false is equally denied under FOR SHARE.
      const disabledId = await provisionOperator("internal-metrics-disabled");
      assertSupabaseSuccess(
        await admin.rpc("change_internal_operator_access", {
          p_operator_user_id: disabledId,
          p_actor_user_id: disabledId,
          p_enabled: false,
          p_reason: "internal metrics disabled recheck probe",
        }),
        "disable metrics probe operator",
      );
      const disabledOperator = await admin.rpc(
        "get_internal_validation_metrics",
        {
          p_operator_user_id: disabledId,
          p_window_start: WINDOW.start,
          p_window_end: WINDOW.end,
        },
      );
      expect(disabledOperator.error).toMatchObject({
        message: expect.stringMatching(/internal operator access required/i),
      });
    },
    DB_CASE_TIMEOUT_MS,
  );
});

describe("internal validation metrics (PostgreSQL snapshot)", () => {
  it(
    "computes exact seeded metrics across Manila midnights",
    async () => {
      const operatorId = await provisionOperator("internal-metrics");
      creatorId = (await createTestUser(admin, uniqueEmail("metrics-creator")))
        .user.id;
      const staffUsers = {
        u6: (await createTestUser(admin, uniqueEmail("metrics-staff6"))).user
          .id,
        u7: (await createTestUser(admin, uniqueEmail("metrics-staff7"))).user
          .id,
        u8: (await createTestUser(admin, uniqueEmail("metrics-staff8"))).user
          .id,
      };

      const ids = {
        q1: fresh(),
        q2: fresh(),
        q3: fresh(),
        q4: fresh(),
        q5: fresh(),
        q6: fresh(),
        q7: fresh(),
        q8: fresh(),
        q9: fresh(),
        r1: fresh(),
        r2: fresh(),
        r3: fresh(),
        r4: fresh(),
        r5: fresh(),
        r6: fresh(),
      };

      const fixtures = [
        // Providers: shop1/shop2/indep1 inside the window, shop3 just before
        // the inclusive start edge, indep2 after the exclusive end.
        providerSql(P_SHOP1, "SHOP", D1A),
        providerSql(P_SHOP2, "SHOP", D1B),
        providerSql(P_INDEP1, "INDEPENDENT", D2A),
        providerSql(P_SHOP3, "SHOP", BEFORE_LATE),
        providerSql(P_INDEP2, "INDEPENDENT", AFTER),
        // Staff footprint: two staff on shop1, one on shop2.
        `INSERT INTO public.provider_memberships (provider_id, user_id, role) VALUES (${sqlUuidLiteral(P_SHOP1.id)}, ${sqlUuidLiteral(staffUsers.u6)}, 'STAFF'), (${sqlUuidLiteral(P_SHOP1.id)}, ${sqlUuidLiteral(staffUsers.u7)}, 'STAFF'), (${sqlUuidLiteral(P_SHOP2.id)}, ${sqlUuidLiteral(staffUsers.u8)}, 'STAFF');`,
        // Requests: q4/q7 submitted before the window (q4 proof of cohort vs
        // period separation); q5 accepted after the window; q6/q8/q9 pending.
        requestFixture({
          id: ids.q1,
          providerId: P_SHOP2.id,
          submitted: D1A,
          accepted: D3A,
          acceptedBy: staffUsers.u6,
        }),
        requestFixture({
          id: ids.q2,
          providerId: P_SHOP2.id,
          submitted: D2A,
          accepted: D3B,
          acceptedBy: staffUsers.u6,
        }),
        requestFixture({
          id: ids.q3,
          providerId: P_INDEP1.id,
          submitted: D2B,
          declined: D3A,
          declinedBy: staffUsers.u7,
        }),
        requestFixture({
          id: ids.q4,
          providerId: P_SHOP2.id,
          submitted: BEFORE,
          accepted: D3A,
          acceptedBy: staffUsers.u8,
        }),
        requestFixture({
          id: ids.q5,
          providerId: P_SHOP3.id,
          submitted: D1B,
          accepted: AFTER,
          acceptedBy: staffUsers.u7,
        }),
        requestFixture({ id: ids.q6, providerId: P_SHOP1.id, submitted: D1A }),
        requestFixture({
          id: ids.q7,
          providerId: P_SHOP1.id,
          submitted: BEFORE,
          accepted: D1B,
          acceptedBy: staffUsers.u8,
        }),
        requestFixture({
          id: ids.q8,
          providerId: P_INDEP2.id,
          submitted: AFTER,
        }),
        requestFixture({
          id: ids.q9,
          providerId: P_SHOP3.id,
          submitted: BEFORE,
        }),
        // Repairs: r1..r3 created inside, r4/r6 before, r5 after.
        repairFixture({
          id: ids.r1,
          providerId: P_SHOP1.id,
          requestId: ids.q7,
          origin: "CUSTOMER_REQUEST",
          created: D1B,
          status: "IN_PROGRESS",
        }),
        repairFixture({
          id: ids.r2,
          providerId: P_SHOP1.id,
          requestId: ids.q6,
          origin: "CUSTOMER_REQUEST",
          created: D1A,
          status: "COMPLETED",
          completed: D2A,
        }),
        repairFixture({
          id: ids.r3,
          providerId: P_INDEP1.id,
          origin: "PROVIDER_CREATED",
          created: D2A,
          status: "IN_PROGRESS",
        }),
        repairFixture({
          id: ids.r4,
          providerId: P_INDEP1.id,
          origin: "PROVIDER_CREATED",
          created: BEFORE_LATE,
          status: "READY",
        }),
        repairFixture({
          id: ids.r5,
          providerId: P_INDEP2.id,
          requestId: ids.q8,
          origin: "CUSTOMER_REQUEST",
          created: AFTER,
          status: "COMPLETED",
          completed: AFTER,
        }),
        repairFixture({
          id: ids.r6,
          providerId: P_SHOP3.id,
          origin: "PROVIDER_CREATED",
          created: BEFORE_LATE,
          status: "IN_PROGRESS",
        }),
        // Status events: initial rows never count; transitions do.
        `INSERT INTO public.repair_status_events (repair_id, from_status, to_status, created_at) VALUES (${sqlUuidLiteral(ids.r2)}, NULL, 'IN_PROGRESS', ${ts(D1A)}), (${sqlUuidLiteral(ids.r2)}, 'IN_PROGRESS', 'READY', ${ts(D2A)}), (${sqlUuidLiteral(ids.r1)}, NULL, 'IN_PROGRESS', ${ts(D1B)}), (${sqlUuidLiteral(ids.r1)}, 'IN_PROGRESS', 'WAITING_FOR_PARTS', ${ts(D2B)}), (${sqlUuidLiteral(ids.r3)}, NULL, 'IN_PROGRESS', ${ts(D2A)}), (${sqlUuidLiteral(ids.r3)}, 'IN_PROGRESS', 'WAITING_FOR_PARTS', ${ts(D3B)}), (${sqlUuidLiteral(ids.r4)}, NULL, 'IN_PROGRESS', ${ts(BEFORE_LATE)}), (${sqlUuidLiteral(ids.r4)}, 'IN_PROGRESS', 'READY', ${ts(BEFORE)}), (${sqlUuidLiteral(ids.r5)}, NULL, 'IN_PROGRESS', ${ts(AFTER)}), (${sqlUuidLiteral(ids.r6)}, NULL, 'IN_PROGRESS', ${ts(BEFORE_LATE)});`,
        // Tracking: two views on r1 (d1,d2), one on r3, one before the window.
        `INSERT INTO public.tracking_events (repair_id, viewed_at) VALUES (${sqlUuidLiteral(ids.r1)}, ${ts(D1B)}), (${sqlUuidLiteral(ids.r1)}, ${ts(D2B)}), (${sqlUuidLiteral(ids.r3)}, ${ts(D2B)}), (${sqlUuidLiteral(ids.r4)}, ${ts(BEFORE_LATE)});`,
      ].join("\n");

      const script = [
        "BEGIN ISOLATION LEVEL REPEATABLE READ;",
        metricsSql(operatorId, "METRICS_BEFORE", WINDOW),
        `DO $$ BEGIN\n${fixtures}\nEND $$;`,
        metricsSql(operatorId, "METRICS_AFTER", WINDOW),
        // Pilot-shaped volume for the EXPLAIN proof: 400 extra repairs.
        `DO $$ BEGIN\nINSERT INTO public.repairs (provider_id, origin, ticket_number, tracking_code, customer_name, customer_phone, device_type, reported_problem, current_status, created_at, created_by_user_id)\nSELECT ${sqlUuidLiteral(P_SHOP1.id)}, 'PROVIDER_CREATED', 'TN-0400-' || lpad(gs::text, 10, '0'), 'TRK-' || lpad(gs::text, 24, '0'), 'Bulk Customer', '+639170000001', 'Phone', 'Bulk problem', 'IN_PROGRESS', now(), ${sqlUuidLiteral(creatorId)}\nFROM generate_series(1, 400) gs;\nEND $$;`,
        "EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY ON) SELECT 1 FROM public.get_internal_validation_metrics(" +
          sqlUuidLiteral(operatorId) +
          ", " +
          ts(WINDOW.start) +
          ", " +
          ts(WINDOW.end) +
          ");",
        "ROLLBACK;",
      ].join("\n");

      const output = await runLocalSql(testUrl, script);
      const before = readMarker(output, "METRICS_BEFORE");
      const after = readMarker(output, "METRICS_AFTER");

      // No business identifier leaks through the fixed output shape.
      for (const row of after) {
        expect(Object.keys(row).sort()).toEqual([
          "bucket",
          "dimension",
          "interval_seconds",
          "row_count",
        ]);
      }
      expect(output).not.toContain("provider_id");

      // All assertions below use after-minus-before deltas, so pre-existing
      // state from other suites cannot shift the expected values.
      const delta = (dimension: string, bucket: string): number =>
        count(after, dimension, bucket) - count(before, dimension, bucket);

      // Providers: onboarding split inside the window, cumulative separately.
      // shop3 created Oct 31 23:59 PHT stays outside the inclusive start.
      expect(delta("PROVIDER_ONBOARDED_IN_PERIOD", "SHOP")).toBe(2);
      expect(delta("PROVIDER_ONBOARDED_IN_PERIOD", "INDEPENDENT")).toBe(1);
      expect(delta("PROVIDER_ONBOARDED_ALL_TIME", "SHOP")).toBe(3);
      expect(delta("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT")).toBe(2);
      expect(delta("PROVIDER_ONBOARDED_ALL_TIME", "TOTAL")).toBe(5);

      // Activity: shop1 on d1+d2, indep1 on d2+d3, shop2 only on d3.
      expect(delta("ACTIVE_PROVIDER_IN_PERIOD", "TOTAL")).toBe(3);
      expect(delta("ACTIVE_PROVIDER_IN_PERIOD", "REPEAT")).toBe(2);
      expect(delta("ACTIVE_DAY", "2026-11-01")).toBe(1);
      expect(delta("ACTIVE_DAY", "2026-11-02")).toBe(2);
      expect(delta("ACTIVE_DAY", "2026-11-03")).toBe(2);
      expect(delta("ACTIVE_DAY", "2026-11-04")).toBe(0);

      // Staff footprint snapshots.
      expect(delta("STAFF_MEMBERSHIP_ACTIVE", "TOTAL")).toBe(3);
      expect(delta("SHOP_WITH_STAFF", "TOTAL")).toBe(2);

      // Current statuses, created split and completion.
      expect(delta("REPAIR_STATUS_NOW", "IN_PROGRESS")).toBe(3);
      expect(delta("REPAIR_STATUS_NOW", "COMPLETED")).toBe(2);
      expect(delta("REPAIR_STATUS_NOW", "READY")).toBe(1);
      expect(delta("REPAIR_STATUS_NOW", "WAITING_FOR_PARTS")).toBe(0);
      expect(delta("REPAIR_CREATED_IN_PERIOD", "TOTAL")).toBe(3);
      expect(delta("REPAIR_CREATED_IN_PERIOD", "CUSTOMER_REQUEST")).toBe(2);
      expect(delta("REPAIR_CREATED_IN_PERIOD", "PROVIDER_CREATED")).toBe(1);
      expect(delta("REPAIR_COMPLETED_IN_PERIOD", "TOTAL")).toBe(1);
      expect(delta("READY_REACHED_IN_PERIOD", "TOTAL")).toBe(1);
      expect(delta("STATUS_MAINTAINED_IN_PERIOD", "TOTAL")).toBe(3);

      // Requests: received vs decided vs cohort conversion, decisions and
      // pending snapshot, and the exact mean decision lag.
      expect(delta("REQUEST_RECEIVED_IN_PERIOD", "TOTAL")).toBe(5);
      expect(delta("REQUEST_DECIDED_IN_PERIOD", "TOTAL")).toBe(5);
      expect(delta("REQUEST_DECIDED_IN_PERIOD", "ACCEPTED")).toBe(4);
      expect(delta("REQUEST_DECIDED_IN_PERIOD", "DECLINED")).toBe(1);
      expect(delta("REQUEST_PENDING_NOW", "TOTAL")).toBe(3);
      expect(delta("REQUEST_COHORT_IN_PERIOD", "RECEIVED")).toBe(5);
      expect(delta("REQUEST_COHORT_IN_PERIOD", "ACCEPTED")).toBe(3);
      expect(delta("REPAIR_ALL_TIME", "TOTAL")).toBe(6);

      // Tracking: views repeat, repairs do not, and the window is bounded.
      expect(delta("TRACKING_VIEWS_IN_PERIOD", "TOTAL")).toBe(3);
      expect(delta("TRACKING_VIEWS_IN_PERIOD", "REPAIRS")).toBe(2);
      expect(delta("TRACKING_ALL_TIME", "TOTAL")).toBe(4);
      expect(delta("TRACKING_ALL_TIME", "REPAIRS")).toBe(3);

      // The decision lag averages the five in-window decisions exactly.
      const decisionRow = after.find(
        (row) =>
          row.dimension === "REQUEST_DECISION_SECONDS" && row.bucket === "MEAN",
      );
      expect(decisionRow).toMatchObject({
        row_count: 5,
        interval_seconds: DECISION_MEAN_SECONDS,
      });

      // Full-circle Typed projection: the fixed rows validate against the
      // application schema and project into the exact documented output.
      const projected = metricsRowSchema.array().parse(
        after.map((row) => ({
          ...row,
          interval_seconds: row.interval_seconds ?? null,
        })),
      );
      const metrics = buildValidationMetrics(
        projected,
        {
          mode: "custom",
          startDate: "2026-11-01",
          endDateExclusive: "2026-11-04",
          days: 3,
          timeZone: "Asia/Manila",
          startUtc: WINDOW.start,
          endUtc: WINDOW.end,
        },
        null as never,
        "2026-11-04T00:00:00.000Z",
      );
      expect(metrics.providers.onboardedInPeriod).toEqual({
        shop: 2,
        independent: 1,
        total: 3,
      });
      // All-time onboarding counts include pre-existing rows, so the typed
      // projection is checked against the fixture deltas.
      const deltaAllTimeRows: MetricsRowJson[] = [
        {
          dimension: "PROVIDER_ONBOARDED_ALL_TIME",
          bucket: "SHOP",
          row_count: delta("PROVIDER_ONBOARDED_ALL_TIME", "SHOP"),
          interval_seconds: null,
        },
        {
          dimension: "PROVIDER_ONBOARDED_ALL_TIME",
          bucket: "INDEPENDENT",
          row_count: delta("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT"),
          interval_seconds: null,
        },
        {
          dimension: "PROVIDER_ONBOARDED_ALL_TIME",
          bucket: "TOTAL",
          row_count: delta("PROVIDER_ONBOARDED_ALL_TIME", "TOTAL"),
          interval_seconds: null,
        },
      ];
      const deltaAllTime = buildValidationMetrics(
        deltaAllTimeRows,
        metrics.window,
        metrics.feedback,
        metrics.asOf,
      );
      expect(deltaAllTime.providers.allTime).toEqual({
        shop: delta("PROVIDER_ONBOARDED_ALL_TIME", "SHOP"),
        independent: delta("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT"),
        total: delta("PROVIDER_ONBOARDED_ALL_TIME", "TOTAL"),
      });
      expect(metrics.activity).toEqual({
        distinctProviders: 3,
        repeatProviders: 2,
        daily: [
          { date: "2026-11-01", distinctProviders: 1 },
          { date: "2026-11-02", distinctProviders: 2 },
          { date: "2026-11-03", distinctProviders: 2 },
        ],
      });
      expect(metrics.staff).toEqual({ memberships: 3, shopsWithStaff: 2 });
      expect(metrics.repairs.created).toEqual({
        total: 3,
        customerRequest: 2,
        providerCreated: 1,
      });
      expect(metrics.requests).toMatchObject({
        received: 5,
        decided: { total: 5, accepted: 4, declined: 1 },
        pendingNow: 3,
        cohortAccepted: 3,
        conversionPercent: 60,
        meanDecisionSeconds: DECISION_MEAN_SECONDS,
      });
      expect(metrics.tracking).toMatchObject({
        periodViews: 3,
        periodRepairsViewed: 2,
        allTimeViews: 4,
        allTimeRepairsViewed: 3,
        allTimeRepairs: 6,
        adoptionPercent: 50,
      });

      // EXPLAIN under the seeded pilot-shaped load: one plan, executed fast.
      const planLines = output
        .split("\n")
        .filter((line) =>
          /^(Function Scan|Execution Time|Planning Time)/.test(line),
        );
      expect(planLines.some((line) => line.startsWith("Function Scan"))).toBe(
        true,
      );
      const executionLine = planLines.find((line) =>
        line.startsWith("Execution Time"),
      );
      expect(executionLine).toBeDefined();
      const ms = Number(
        executionLine?.match(/Execution Time: ([0-9.]+) ms/)?.[1] ?? NaN,
      );
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeLessThan(5000);

      // The transaction rolled back, so none of the fixtures persisted.
      const persisted = assertSupabaseSuccess(
        await admin
          .from("repairs")
          .select("id")
          .eq("tracking_code", `TRK-${uuidHex(ids.r1, 24)}`),
        "check fixtures rolled back",
      ).data;
      expect(persisted).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );
});
