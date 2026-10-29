import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  assertSupabaseSuccess,
  createAdminClient,
  createTestUser,
  requireDbConfig,
  testUrl,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import { runLocalSql, sqlUuidLiteral } from "../helpers/local-postgres";

// Direct SQL proof of the Manila-aligned summary bounds. The feature entry's
// Manila-to-UTC conversion is unit-tested in feedback.test.ts; this file proves
// the real function's bounds and Asia/Manila day buckets for the same instants.
//
// One psql session runs the whole script inside a REPEATABLE READ transaction.
// Baselines and the after-reads share one snapshot, so concurrent committed
// writes elsewhere cannot change the deltas. Only this script's own fixtures
// are written, through the existing RPC and a per-nonce timestamp update, and
// the transaction ends with ROLLBACK, so nothing persists.

requireDbConfig();

const admin = createAdminClient();
const DB_CASE_TIMEOUT_MS = 90_000;
const CANARY = "manila-summary-canary-4e21";
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Asia/Manila calendar days 2026-11-01 to 2026-11-03 (three days), and the
// first day alone, as the UTC instants Manila midnight maps to.
const THREE_DAYS = {
  start: "2026-10-31T16:00:00.000Z",
  end: "2026-11-03T16:00:00.000Z",
};
const FIRST_DAY = {
  start: "2026-10-31T16:00:00.000Z",
  end: "2026-11-01T16:00:00.000Z",
};

const BEFORE_START = "2026-10-31T15:59:00.000Z"; // Oct 31 23:59 PHT, excluded
const START_EDGE = "2026-10-31T16:00:00.000Z"; // Nov 1 00:00 PHT, included
const FIRST_DAY_EARLY = "2026-10-31T16:30:00.000Z"; // Nov 1 00:30 PHT
const FIRST_DAY_LATE = "2026-11-01T15:59:59.999Z"; // Nov 1 23:59:59.999 PHT
const SECOND_DAY_START = "2026-11-01T16:00:00.000Z"; // Nov 2 00:00 PHT
const AFTER_END = "2026-11-03T16:00:00.000Z"; // Nov 4 00:00 PHT, exclusive end

const FIXTURES = [
  {
    instant: BEFORE_START,
    category: "GENERAL",
    source: "PUBLIC_REQUEST",
    reviewed: false,
  },
  {
    instant: START_EDGE,
    category: "BUG",
    source: "PUBLIC_TRACKING",
    reviewed: false,
  },
  {
    instant: FIRST_DAY_EARLY,
    category: "BUG",
    source: "PUBLIC_TRACKING",
    reviewed: false,
  },
  {
    instant: FIRST_DAY_LATE,
    category: "BUG",
    source: "PUBLIC_FEEDBACK",
    reviewed: true,
  },
  {
    instant: SECOND_DAY_START,
    category: "GENERAL",
    source: "PUBLIC_REQUEST",
    reviewed: false,
  },
  {
    instant: AFTER_END,
    category: "GENERAL",
    source: "PUBLIC_REQUEST",
    reviewed: false,
  },
];

type SummaryRow = { dimension: string; bucket: string; row_count: number };

function timestampLiteral(instant: string): string {
  if (!TIMESTAMP_PATTERN.test(instant)) {
    throw new Error(`Refusing non-timestamp SQL literal: ${instant}`);
  }
  return `'${instant}'::timestamptz`;
}

// Emits one marker line with the RPC rows as JSON. An empty result becomes [].
function summarySql(
  marker: string,
  operatorId: string,
  window: { start: string; end: string },
): string {
  return `SELECT '${marker} ' || coalesce((SELECT json_agg(row_to_json(s))::text FROM public.get_feedback_count_summary(${sqlUuidLiteral(operatorId)}, ${timestampLiteral(window.start)}, ${timestampLiteral(window.end)}) AS s), '[]');`;
}

// Creates one fixture through the real submission RPC, then pins its created_at
// by its own nonce. PERFORM keeps the RPC's return value out of the output.
function fixtureSql(
  operatorId: string,
  fixture: (typeof FIXTURES)[number],
  nonce: string,
): string {
  const nonceLiteral = sqlUuidLiteral(nonce);
  const lines = [
    `PERFORM public.submit_feedback(${nonceLiteral}, '${fixture.category}', '${fixture.source}', 'PUBLIC_SELF_REPORTED_CUSTOMER', NULL, '${CANARY}');`,
    `UPDATE public.feedback_submissions SET created_at = ${timestampLiteral(fixture.instant)} WHERE submission_nonce = ${nonceLiteral};`,
  ];
  if (fixture.reviewed) {
    lines.push(
      `PERFORM public.record_feedback_review((SELECT id FROM public.feedback_submissions WHERE submission_nonce = ${nonceLiteral}), ${sqlUuidLiteral(operatorId)}, 1, 'REVIEWING', 'NORMAL', NULL, NULL, NULL);`,
    );
  }
  return lines.join("\n");
}

function buildScript(operatorId: string): string {
  const fixtures = FIXTURES.map((fixture) =>
    fixtureSql(operatorId, fixture, randomUUID()),
  ).join("\n");

  return [
    "BEGIN ISOLATION LEVEL REPEATABLE READ;",
    summarySql("THREE_BEFORE", operatorId, THREE_DAYS),
    summarySql("FIRST_BEFORE", operatorId, FIRST_DAY),
    `DO $$ BEGIN\n${fixtures}\nEND $$;`,
    summarySql("THREE_AFTER", operatorId, THREE_DAYS),
    summarySql("FIRST_AFTER", operatorId, FIRST_DAY),
    "ROLLBACK;",
  ].join("\n");
}

function readMarker(output: string, marker: string): SummaryRow[] {
  const line = output
    .split("\n")
    .find((entry) => entry.startsWith(`${marker} `));
  if (line === undefined) {
    throw new Error(`The snapshot script produced no ${marker} output`);
  }
  return JSON.parse(line.slice(marker.length + 1)) as SummaryRow[];
}

function count(rows: SummaryRow[], dimension: string, bucket: string): number {
  return (
    rows.find((row) => row.dimension === dimension && row.bucket === bucket)
      ?.row_count ?? 0
  );
}

function categoryTotal(rows: SummaryRow[]): number {
  return rows
    .filter((row) => row.dimension === "CATEGORY")
    .reduce((sum, row) => sum + row.row_count, 0);
}

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: "feedback manila summary integration operator",
    }),
    `provision ${prefix} operator`,
  );
  return created.user.id;
}

describe("Feedback summary Manila bounds (PostgreSQL snapshot)", () => {
  it(
    "counts Manila days across UTC midnight in one REPEATABLE READ snapshot",
    async () => {
      const operatorId = await provisionOperator("feedback-manila-summary");
      const output = await runLocalSql(testUrl, buildScript(operatorId));

      const threeBefore = readMarker(output, "THREE_BEFORE");
      const threeAfter = readMarker(output, "THREE_AFTER");
      const firstBefore = readMarker(output, "FIRST_BEFORE");
      const firstAfter = readMarker(output, "FIRST_AFTER");
      expect(output).not.toContain(CANARY);

      // Included on Nov 1 PHT: the 00:00 start edge, 00:30, and 23:59:59.999.
      // Included on Nov 2 PHT: the 00:00 PHT row. Excluded: Oct 31 23:59 PHT
      // and the exclusive Nov 4 PHT boundary.
      expect(
        count(threeAfter, "DAY", "2026-11-01") -
          count(threeBefore, "DAY", "2026-11-01"),
      ).toBe(3);
      expect(
        count(threeAfter, "DAY", "2026-11-02") -
          count(threeBefore, "DAY", "2026-11-02"),
      ).toBe(1);
      expect(
        count(threeAfter, "DAY", "2026-11-03") -
          count(threeBefore, "DAY", "2026-11-03"),
      ).toBe(0);
      expect(
        count(threeAfter, "DAY", "2026-10-31") -
          count(threeBefore, "DAY", "2026-10-31"),
      ).toBe(0);
      expect(
        count(threeAfter, "DAY", "2026-11-04") -
          count(threeBefore, "DAY", "2026-11-04"),
      ).toBe(0);
      expect(categoryTotal(threeAfter) - categoryTotal(threeBefore)).toBe(4);
      expect(
        count(threeAfter, "CATEGORY", "BUG") -
          count(threeBefore, "CATEGORY", "BUG"),
      ).toBe(3);
      expect(
        count(threeAfter, "STATUS", "REVIEWING") -
          count(threeBefore, "STATUS", "REVIEWING"),
      ).toBe(1);
      expect(
        count(threeAfter, "SOURCE", "PUBLIC_TRACKING") -
          count(threeBefore, "SOURCE", "PUBLIC_TRACKING"),
      ).toBe(2);
      expect(
        count(threeAfter, "SOURCE", "PUBLIC_FEEDBACK") -
          count(threeBefore, "SOURCE", "PUBLIC_FEEDBACK"),
      ).toBe(1);
      expect(
        count(threeAfter, "SOURCE", "PUBLIC_REQUEST") -
          count(threeBefore, "SOURCE", "PUBLIC_REQUEST"),
      ).toBe(1);
      expect(
        count(threeAfter, "SOURCE", "PROVIDER_WORKSPACE") -
          count(threeBefore, "SOURCE", "PROVIDER_WORKSPACE"),
      ).toBe(0);

      // The one-day window sees only the Nov 1 PHT rows.
      expect(categoryTotal(firstAfter) - categoryTotal(firstBefore)).toBe(3);
      expect(
        count(firstAfter, "DAY", "2026-11-01") -
          count(firstBefore, "DAY", "2026-11-01"),
      ).toBe(3);
      expect(
        count(firstAfter, "DAY", "2026-11-02") -
          count(firstBefore, "DAY", "2026-11-02"),
      ).toBe(0);
      expect(
        count(firstAfter, "SOURCE", "PUBLIC_TRACKING") -
          count(firstBefore, "SOURCE", "PUBLIC_TRACKING"),
      ).toBe(2);
      expect(
        count(firstAfter, "SOURCE", "PUBLIC_FEEDBACK") -
          count(firstBefore, "SOURCE", "PUBLIC_FEEDBACK"),
      ).toBe(1);
      expect(
        count(firstAfter, "SOURCE", "PUBLIC_REQUEST") -
          count(firstBefore, "SOURCE", "PUBLIC_REQUEST"),
      ).toBe(0);
      expect(
        count(firstAfter, "SOURCE", "PROVIDER_WORKSPACE") -
          count(firstBefore, "SOURCE", "PROVIDER_WORKSPACE"),
      ).toBe(0);

      // The transaction rolled back, so none of the fixtures persisted.
      const persisted = assertSupabaseSuccess(
        await admin
          .from("feedback_submissions")
          .select("id")
          .eq("message", CANARY),
        "check fixtures rolled back",
      ).data;
      expect(persisted).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );
});
