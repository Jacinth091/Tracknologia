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
// that ends with ROLLBACK, so no fixture persists. The window is a fixed past
// range (Manila days 2026-10-19..21), so no other suite touches it and the
// exact counts are deterministic. Each RPC call returns one as_of timestamp
// captured database-side; every row of that call carries the same value.

requireDbConfig();

const admin = createAdminClient();
const DB_CASE_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;

function ts(instant: string): string {
  return `'${instant}'::timestamptz`;
}

// Manila boundaries: d1 starts 2026-10-18T16:00Z; AFTER is the exclusive end.
const WINDOW = {
  start: "2026-10-18T16:00:00.000Z",
  end: "2026-10-21T16:00:00.000Z",
};
const BEFORE = "2026-10-18T14:00:00.000Z";
const BEFORE_LATE = "2026-10-18T15:59:00.000Z"; // excluded: 23:59 PHT Oct 18
const D1A = "2026-10-18T16:00:00.000Z"; // 00:00 PHT Oct 19, inclusive edge
const D1B = "2026-10-18T17:00:00.000Z";
const D2A = "2026-10-19T16:00:00.000Z"; // 00:00 PHT Oct 20
const D2B = "2026-10-19T17:00:00.000Z";
const D3A = "2026-10-20T16:00:00.000Z"; // 00:00 PHT Oct 21
const D3B = "2026-10-20T17:00:00.000Z";
const AFTER = "2026-10-21T16:00:00.000Z"; // 00:00 PHT Oct 22, exclusive end

const fresh = () => randomUUID();
const P_SHOP1 = { id: fresh(), slug: `metrics-a-${randomUUID().slice(0, 8)}` };
const P_SHOP2 = { id: fresh(), slug: `metrics-b-${randomUUID().slice(0, 8)}` };
const P_INDEP1 = { id: fresh(), slug: `metrics-c-${randomUUID().slice(0, 8)}` };
const P_SHOP3 = { id: fresh(), slug: `metrics-d-${randomUUID().slice(0, 8)}` };
const P_INDEP2 = { id: fresh(), slug: `metrics-e-${randomUUID().slice(0, 8)}` };
// Pre-existing global state: a provider and a SUBMITTED request that exist
// before the BEFORE snapshot, as in an upgraded database.
const P_BASE = {
  id: fresh(),
  slug: `metrics-base-${randomUUID().slice(0, 8)}`,
};

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

// Exact decision seconds inside the window: an additive sum, so the fixture
// delta divided by the fixture decision count is exact without subtracting
// any mean.
function decisionSumSql(marker: string): string {
  return `SELECT '${marker} ' || coalesce(sum(EXTRACT(EPOCH FROM (COALESCE(rr.accepted_at, rr.declined_at) - rr.submitted_at))), 0)::text FROM public.repair_requests rr WHERE COALESCE(rr.accepted_at, rr.declined_at) >= ${ts(WINDOW.start)} AND COALESCE(rr.accepted_at, rr.declined_at) < ${ts(WINDOW.end)};`;
}

// The Asia/Manila calendar day that contains the database clock, as a window.
function todayMetricsSql(operatorId: string, marker: string): string {
  const start =
    "(date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')";
  const end =
    "((date_trunc('day', now() AT TIME ZONE 'Asia/Manila') + interval '1 day') AT TIME ZONE 'Asia/Manila')";
  return `SELECT '${marker} ' || coalesce((SELECT json_agg(row_to_json(s))::text FROM public.get_internal_validation_metrics(${sqlUuidLiteral(operatorId)}, ${start}, ${end}) AS s), '[]');`;
}

// Asia/Manila calendar date for an instant, and the Manila midnight that
// follows it. Used only to build test-time instants, never as expected output.
function manilaDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    instant,
  );
}

function nextManilaMidnight(instant: Date): Date {
  const today = manilaDate(instant);
  return new Date(Date.parse(`${today}T00:00:00+08:00`) + DAY_MS);
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
  as_of: string;
};

function readLine(output: string, marker: string): string {
  const line = output
    .split("\n")
    .find((entry) => entry.startsWith(`${marker} `));
  if (line === undefined) {
    throw new Error(`The snapshot script produced no ${marker} output`);
  }
  return line.slice(marker.length + 1);
}

function readMarker(output: string, marker: string): MetricsRowJson[] {
  return JSON.parse(readLine(output, marker)) as MetricsRowJson[];
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

// Every row of one RPC call shares the single as_of the function captured.
function singleAsOf(rows: MetricsRowJson[]): string {
  const asOfValues = new Set(rows.map((row) => row.as_of));
  expect(asOfValues.size).toBe(1);
  const [asOf] = asOfValues;
  expect(Number.isFinite(Date.parse(asOf))).toBe(true);
  return asOf;
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

describe("get_internal_validation_metrics window bounds (PostgreSQL)", () => {
  it(
    "accepts exactly 90 Manila days and rejects invalid, misaligned, future and infinite bounds",
    async () => {
      const operatorId = await provisionOperator("internal-metrics-bounds");
      // Each case is one rolled-back statement, so a rejected call leaves no
      // state behind and cannot affect another test.
      const runWindow = (startSql: string, endSql: string) =>
        runLocalSql(
          testUrl,
          `BEGIN;\nSELECT count(*) FROM public.get_internal_validation_metrics(${sqlUuidLiteral(operatorId)}, ${startSql}, ${endSql});\nROLLBACK;`,
        );

      // Exactly 90 Manila days: 2026-07-20T16:00Z .. 2026-10-18T16:00Z.
      await expect(
        runWindow(ts("2026-07-20T16:00:00.000Z"), ts(WINDOW.start)),
      ).resolves.toMatch(/^\d+$/);

      const tomorrowMidnight = nextManilaMidnight(new Date());
      const rejected: Array<[string, string]> = [
        // 91 Manila days.
        [ts("2026-07-19T16:00:00.000Z"), ts(WINDOW.start)],
        // End not after start.
        [ts(WINDOW.end), ts(WINDOW.start)],
        // Start not on a Manila midnight.
        [ts("2026-10-18T16:30:00.000Z"), ts(WINDOW.end)],
        // Start in the future.
        [
          ts(tomorrowMidnight.toISOString()),
          ts(new Date(tomorrowMidnight.getTime() + DAY_MS).toISOString()),
        ],
        // End beyond the next Manila midnight.
        [
          ts(WINDOW.start),
          ts(new Date(tomorrowMidnight.getTime() + 3_600_000).toISOString()),
        ],
        // Infinite bound.
        [ts(WINDOW.start), "'infinity'::timestamptz"],
      ];
      for (const [startSql, endSql] of rejected) {
        await expect(runWindow(startSql, endSql)).rejects.toThrow();
      }
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
        baseline: fresh(),
      };

      // Baseline: a pre-existing global provider and SUBMITTED request, created
      // before the BEFORE snapshot in the same transaction. It is outside the
      // window, so only the global snapshots see it.
      const nowIso = new Date().toISOString();
      const baselineFixture = [
        providerSql(P_BASE, "SHOP", nowIso),
        requestFixture({
          id: ids.baseline,
          providerId: P_BASE.id,
          submitted: nowIso,
        }),
      ].join("\n");

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

      // A Repair created in the last second of today in Asia/Manila is future
      // relative to the RPC's as_of, so today's window must not count it.
      const futureRepair = repairFixture({
        id: fresh(),
        providerId: P_SHOP1.id,
        origin: "PROVIDER_CREATED",
        created: new Date(
          nextManilaMidnight(new Date()).getTime() - 1000,
        ).toISOString(),
        status: "IN_PROGRESS",
      });

      const script = [
        "BEGIN ISOLATION LEVEL REPEATABLE READ;",
        `DO $$ BEGIN\n${baselineFixture}\nEND $$;`,
        metricsSql(operatorId, "METRICS_BEFORE", WINDOW),
        decisionSumSql("DECISION_SUM_BEFORE"),
        `DO $$ BEGIN\n${fixtures}\nEND $$;`,
        metricsSql(operatorId, "METRICS_AFTER", WINDOW),
        decisionSumSql("DECISION_SUM_AFTER"),
        todayMetricsSql(operatorId, "FUTURE_PROBE_BEFORE"),
        `DO $$ BEGIN\n${futureRepair}\nEND $$;`,
        todayMetricsSql(operatorId, "FUTURE_PROBE_AFTER"),
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

      // The strict row shape: no business identifier, and as_of on every row.
      for (const row of after) {
        expect(Object.keys(row).sort()).toEqual([
          "as_of",
          "bucket",
          "dimension",
          "interval_seconds",
          "row_count",
        ]);
      }
      expect(output).not.toContain("provider_id");

      // Each RPC call returns one snapshot timestamp, and a later call in the
      // same transaction captures a timestamp no earlier than the first.
      const asOfBefore = singleAsOf(before);
      const asOfAfter = singleAsOf(after);
      expect(Date.parse(asOfBefore)).toBeLessThanOrEqual(Date.parse(asOfAfter));

      // Global baseline: the pre-existing pending request is visible to the
      // full projection, and the fixture adds exactly three more.
      const pendingBefore = count(before, "REQUEST_PENDING_NOW", "TOTAL");
      expect(pendingBefore).toBeGreaterThanOrEqual(1);

      // Fixture deltas are additive, so they cannot be shifted by pre-existing
      // global rows.
      const delta = (dimension: string, bucket: string): number =>
        count(after, dimension, bucket) - count(before, dimension, bucket);

      // Providers: onboarding split inside the window, cumulative separately.
      // shop3 created Oct 18 23:59 PHT stays outside the inclusive start.
      expect(delta("PROVIDER_ONBOARDED_IN_PERIOD", "SHOP")).toBe(2);
      expect(delta("PROVIDER_ONBOARDED_IN_PERIOD", "INDEPENDENT")).toBe(1);
      expect(delta("PROVIDER_ONBOARDED_ALL_TIME", "SHOP")).toBe(3);
      expect(delta("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT")).toBe(2);
      expect(delta("PROVIDER_ONBOARDED_ALL_TIME", "TOTAL")).toBe(5);

      // Activity: shop1 on d1+d2, indep1 on d2+d3, shop2 only on d3.
      expect(delta("ACTIVE_PROVIDER_IN_PERIOD", "TOTAL")).toBe(3);
      expect(delta("ACTIVE_PROVIDER_IN_PERIOD", "REPEAT")).toBe(2);
      expect(delta("ACTIVE_DAY", "2026-10-19")).toBe(1);
      expect(delta("ACTIVE_DAY", "2026-10-20")).toBe(2);
      expect(delta("ACTIVE_DAY", "2026-10-21")).toBe(2);
      expect(delta("ACTIVE_DAY", "2026-10-22")).toBe(0);

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

      // Requests: received vs decided vs cohort, and the pending snapshot.
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

      // Mean decision seconds is not additive, so it is derived from the sum
      // and count deltas, which are additive.
      const sumBefore = Number(readLine(output, "DECISION_SUM_BEFORE"));
      const sumAfter = Number(readLine(output, "DECISION_SUM_AFTER"));
      const decisionCount = delta("REQUEST_DECISION_SECONDS", "MEAN");
      expect(decisionCount).toBe(5);
      expect((sumAfter - sumBefore) / decisionCount).toBe(
        DECISION_MEAN_SECONDS,
      );

      // Current-day future exclusion: the Repair created after as_of is absent.
      expect(
        count(
          readMarker(output, "FUTURE_PROBE_AFTER"),
          "REPAIR_CREATED_IN_PERIOD",
          "TOTAL",
        ) -
          count(
            readMarker(output, "FUTURE_PROBE_BEFORE"),
            "REPAIR_CREATED_IN_PERIOD",
            "TOTAL",
          ),
      ).toBe(0);

      // Full projection of the complete raw rows, with the baseline included.
      // Ratios, means and the daily series are derived from raw rows, never
      // from deltas.
      const rawCount = (dimension: string, bucket: string): number =>
        count(after, dimension, bucket);
      const rawPercent = (numerator: number, denominator: number) =>
        denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
      const rawDecision = after.find(
        (row) =>
          row.dimension === "REQUEST_DECISION_SECONDS" && row.bucket === "MEAN",
      );

      const complete = metricsRowSchema.array().parse(after);
      expect(complete).toHaveLength(after.length);
      expect(() =>
        metricsRowSchema.parse({
          dimension: "ACTIVE_DAY",
          bucket: "2026-10-19",
          row_count: 1,
          interval_seconds: null,
        }),
      ).toThrow();

      const window = {
        mode: "custom" as const,
        startDate: "2026-10-19",
        endDateExclusive: "2026-10-22",
        days: 3,
        timeZone: "Asia/Manila" as const,
        startUtc: WINDOW.start,
        endUtc: WINDOW.end,
      };
      const metrics = buildValidationMetrics(complete, window, null, asOfAfter);

      expect(metrics.asOf).toBe(asOfAfter);
      expect(metrics.providers.onboardedInPeriod).toEqual({
        shop: rawCount("PROVIDER_ONBOARDED_IN_PERIOD", "SHOP"),
        independent: rawCount("PROVIDER_ONBOARDED_IN_PERIOD", "INDEPENDENT"),
        total:
          rawCount("PROVIDER_ONBOARDED_IN_PERIOD", "SHOP") +
          rawCount("PROVIDER_ONBOARDED_IN_PERIOD", "INDEPENDENT"),
      });
      expect(metrics.providers.allTime).toEqual({
        shop: rawCount("PROVIDER_ONBOARDED_ALL_TIME", "SHOP"),
        independent: rawCount("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT"),
        total: rawCount("PROVIDER_ONBOARDED_ALL_TIME", "TOTAL"),
      });
      expect(metrics.activity).toEqual({
        distinctProviders: rawCount("ACTIVE_PROVIDER_IN_PERIOD", "TOTAL"),
        repeatProviders: rawCount("ACTIVE_PROVIDER_IN_PERIOD", "REPEAT"),
        daily: ["2026-10-19", "2026-10-20", "2026-10-21"].map((date) => ({
          date,
          distinctProviders: rawCount("ACTIVE_DAY", date),
        })),
      });
      expect(metrics.staff).toEqual({
        memberships: rawCount("STAFF_MEMBERSHIP_ACTIVE", "TOTAL"),
        shopsWithStaff: rawCount("SHOP_WITH_STAFF", "TOTAL"),
      });
      expect(metrics.repairs.created).toEqual({
        total: rawCount("REPAIR_CREATED_IN_PERIOD", "TOTAL"),
        customerRequest: rawCount(
          "REPAIR_CREATED_IN_PERIOD",
          "CUSTOMER_REQUEST",
        ),
        providerCreated: rawCount(
          "REPAIR_CREATED_IN_PERIOD",
          "PROVIDER_CREATED",
        ),
      });
      expect(metrics.requests).toMatchObject({
        received: rawCount("REQUEST_RECEIVED_IN_PERIOD", "TOTAL"),
        decided: {
          total: rawCount("REQUEST_DECIDED_IN_PERIOD", "TOTAL"),
          accepted: rawCount("REQUEST_DECIDED_IN_PERIOD", "ACCEPTED"),
          declined: rawCount("REQUEST_DECIDED_IN_PERIOD", "DECLINED"),
        },
        pendingNow: pendingBefore + 3,
        cohortAccepted: rawCount("REQUEST_COHORT_IN_PERIOD", "ACCEPTED"),
        conversionPercent: rawPercent(
          rawCount("REQUEST_COHORT_IN_PERIOD", "ACCEPTED"),
          rawCount("REQUEST_COHORT_IN_PERIOD", "RECEIVED"),
        ),
        meanDecisionSeconds: rawDecision?.interval_seconds ?? null,
      });
      expect(metrics.tracking).toMatchObject({
        periodViews: rawCount("TRACKING_VIEWS_IN_PERIOD", "TOTAL"),
        periodRepairsViewed: rawCount("TRACKING_VIEWS_IN_PERIOD", "REPAIRS"),
        allTimeViews: rawCount("TRACKING_ALL_TIME", "TOTAL"),
        allTimeRepairsViewed: rawCount("TRACKING_ALL_TIME", "REPAIRS"),
        allTimeRepairs: rawCount("REPAIR_ALL_TIME", "TOTAL"),
        adoptionPercent: rawPercent(
          rawCount("TRACKING_ALL_TIME", "REPAIRS"),
          rawCount("REPAIR_ALL_TIME", "TOTAL"),
        ),
      });

      // All-time onboarding in sparse typed delta rows, carrying the same
      // as_of, so the projection is checked against fixture deltas.
      const deltaAllTimeRows: MetricsRowJson[] = [
        {
          dimension: "PROVIDER_ONBOARDED_ALL_TIME",
          bucket: "SHOP",
          row_count: delta("PROVIDER_ONBOARDED_ALL_TIME", "SHOP"),
          interval_seconds: null,
          as_of: asOfAfter,
        },
        {
          dimension: "PROVIDER_ONBOARDED_ALL_TIME",
          bucket: "INDEPENDENT",
          row_count: delta("PROVIDER_ONBOARDED_ALL_TIME", "INDEPENDENT"),
          interval_seconds: null,
          as_of: asOfAfter,
        },
        {
          dimension: "PROVIDER_ONBOARDED_ALL_TIME",
          bucket: "TOTAL",
          row_count: delta("PROVIDER_ONBOARDED_ALL_TIME", "TOTAL"),
          interval_seconds: null,
          as_of: asOfAfter,
        },
      ];
      const deltaProjection = buildValidationMetrics(
        metricsRowSchema.array().parse(deltaAllTimeRows),
        metrics.window,
        metrics.feedback,
        metrics.asOf,
      );
      expect(deltaProjection.providers.allTime).toEqual({
        shop: 3,
        independent: 2,
        total: 5,
      });

      // EXPLAIN under the seeded pilot-shaped load. The outer Function Scan
      // line shows one set-based call. It does not count the function's
      // internal queries, so only the measured execution time is recorded.
      const explainLines = output
        .split("\n")
        .filter((line) => /^(Function Scan|Execution Time)/.test(line));
      expect(
        explainLines.some((line) => line.startsWith("Function Scan")),
      ).toBe(true);
      const executionLine = explainLines.find((line) =>
        line.startsWith("Execution Time"),
      );
      const executionMs = Number(
        executionLine?.match(/Execution Time: ([0-9.]+) ms/)?.[1] ?? NaN,
      );
      expect(Number.isFinite(executionMs)).toBe(true);
      expect(executionMs).toBeLessThan(5000);
      console.info(
        JSON.stringify({
          check: "internal-metrics-explain",
          syntheticRepairs: 400,
          executionMs,
        }),
      );

      // The rolled-back fixtures left nothing persistent.
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
