import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mock boundary, stated plainly: only the operator guard and the Supabase
// client factory are replaced. The guard returns ALLOWED for a real, enabled
// operator provisioned below, and the access audit is stubbed to succeed. The
// summary feature, its persistence, and the real PostgreSQL function run as
// they do in production.
const shared = vi.hoisted(() => ({
  client: undefined as unknown,
  operatorId: "",
}));

vi.mock("@/features/internal-operations/access", () => ({
  requireInternalOperator: async () => ({
    status: "ALLOWED",
    userId: shared.operatorId,
  }),
  recordSensitiveInternalAccess: async () => true,
}));

vi.mock("@/lib/supabase/internal", () => ({
  createInternalOpsClient: async () => shared.client,
}));

import { getFeedbackAggregateSummary } from "@/features/feedback/queries";

import {
  assertSupabaseSuccess,
  createAdminClient,
  createTestUser,
  requireDbConfig,
  testUrl,
  uniqueEmail,
} from "./helpers/supabase-test-context";
import { runLocalSql, sqlUuidLiteral } from "../helpers/local-postgres";

requireDbConfig();

const admin = createAdminClient();
shared.client = admin;

const DB_CASE_TIMEOUT_MS = 90_000;
const CANARY = "manila-summary-canary-4e21";
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Asia/Manila calendar days 2026-11-01 to 2026-11-03 inclusive. The fixed
// instants below sit on both sides of the Manila midnights they test.
const THREE_DAYS = { startDate: "2026-11-01", endDateExclusive: "2026-11-04" };
const FIRST_DAY = { startDate: "2026-11-01", endDateExclusive: "2026-11-02" };
const BEFORE_FIRST_DAY = "2026-10-31T15:59:00.000Z"; // Oct 31 23:59 PHT
const FIRST_DAY_EARLY = "2026-10-31T16:30:00.000Z"; // Nov 1 00:30 PHT
const FIRST_DAY_LATE = "2026-11-01T15:59:59.999Z"; // Nov 1 23:59:59.999 PHT
const SECOND_DAY_START = "2026-11-01T16:00:00.000Z"; // Nov 2 00:00 PHT
const AFTER_WINDOW_END = "2026-11-03T16:00:00.000Z"; // Nov 4 00:00 PHT, exclusive

async function submitAt(
  instant: string,
  overrides: Record<string, unknown>,
): Promise<string> {
  if (!TIMESTAMP_PATTERN.test(instant)) {
    throw new Error(`Refusing non-timestamp SQL literal: ${instant}`);
  }
  const nonce = randomUUID();
  assertSupabaseSuccess(
    await admin.rpc("submit_feedback", {
      p_submission_nonce: nonce,
      p_category: "GENERAL",
      p_source: "PUBLIC_REQUEST",
      p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      p_title: null,
      p_message: `${CANARY} ${instant}`,
      ...overrides,
    }),
    "submit manila fixture",
  );
  const { id } = assertSupabaseSuccess(
    await admin
      .from("feedback_submissions")
      .select("id")
      .eq("submission_nonce", nonce)
      .single(),
    "read manila fixture id",
  ).data as { id: string };
  // Only this fixture's id is updated, with a validated timestamp literal.
  await runLocalSql(
    testUrl,
    `UPDATE public.feedback_submissions SET created_at = '${instant}'::timestamptz WHERE id = ${sqlUuidLiteral(id)};`,
  );
  return id;
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

function dayCount(
  summary: { daily: Array<{ date: string; count: number }> },
  date: string,
) {
  return summary.daily.find((day) => day.date === date)?.count ?? 0;
}

describe("Feedback summary over Asia/Manila periods (PostgreSQL)", () => {
  it(
    "counts Manila days across UTC midnight, excludes both ends, and zero-fills",
    async () => {
      shared.operatorId = await provisionOperator("feedback-manila-summary");

      // Baselines are taken before this run's fixtures, so rows left by an
      // earlier run in the same fixed window cannot change the expected deltas.
      const baselineThree = await getFeedbackAggregateSummary(THREE_DAYS);
      const baselineFirst = await getFeedbackAggregateSummary(FIRST_DAY);

      await submitAt(BEFORE_FIRST_DAY, {
        p_category: "GENERAL",
        p_source: "PUBLIC_REQUEST",
      });
      await submitAt(FIRST_DAY_EARLY, {
        p_category: "BUG",
        p_source: "PUBLIC_TRACKING",
      });
      const reviewed = await submitAt(FIRST_DAY_LATE, {
        p_category: "BUG",
        p_source: "PUBLIC_FEEDBACK",
      });
      await submitAt(SECOND_DAY_START, {
        p_category: "GENERAL",
        p_source: "PUBLIC_REQUEST",
      });
      await submitAt(AFTER_WINDOW_END, {
        p_category: "GENERAL",
        p_source: "PUBLIC_REQUEST",
      });

      assertSupabaseSuccess(
        await admin.rpc("record_feedback_review", {
          p_feedback_id: reviewed,
          p_operator_user_id: shared.operatorId,
          p_expected_row_version: 1,
          p_target_status: "REVIEWING",
          p_target_priority: "NORMAL",
          p_internal_notes: null,
          p_linked_issue_url: null,
          p_reason: null,
        }),
        "review manila fixture",
      );

      const three = await getFeedbackAggregateSummary(THREE_DAYS);
      expect(three.window).toEqual({
        timeZone: "Asia/Manila",
        startDate: "2026-11-01",
        endDateExclusive: "2026-11-04",
        days: 3,
      });
      // Included: the 00:30 and 23:59 PHT rows on Nov 1 and the 00:00 PHT row
      // on Nov 2. Excluded: Oct 31 23:59 PHT and the exclusive Nov 4 start.
      expect(three.total - baselineThree.total).toBe(3);
      expect(three.daily.map((day) => day.date)).toEqual([
        "2026-11-01",
        "2026-11-02",
        "2026-11-03",
      ]);
      expect(
        dayCount(three, "2026-11-01") - dayCount(baselineThree, "2026-11-01"),
      ).toBe(2);
      expect(
        dayCount(three, "2026-11-02") - dayCount(baselineThree, "2026-11-02"),
      ).toBe(1);
      // Nov 3 has no fixture in the window, so it is zero-filled.
      expect(
        dayCount(three, "2026-11-03") - dayCount(baselineThree, "2026-11-03"),
      ).toBe(0);
      expect(three.byCategory.BUG - baselineThree.byCategory.BUG).toBe(2);
      expect(three.byCategory.GENERAL - baselineThree.byCategory.GENERAL).toBe(
        1,
      );
      expect(three.byStatus.NEW - baselineThree.byStatus.NEW).toBe(2);
      expect(three.byStatus.REVIEWING - baselineThree.byStatus.REVIEWING).toBe(
        1,
      );
      expect(JSON.stringify(three)).not.toContain(CANARY);

      const first = await getFeedbackAggregateSummary(FIRST_DAY);
      expect(first.window.days).toBe(1);
      expect(first.total - baselineFirst.total).toBe(2);
      expect(
        dayCount(first, "2026-11-01") - dayCount(baselineFirst, "2026-11-01"),
      ).toBe(2);
    },
    DB_CASE_TIMEOUT_MS,
  );
});
