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
import {
  listFeedbackPreviews,
  readFeedbackDetail,
} from "@/features/feedback/persistence";

requireDbConfig();

// Real PostgREST through the feature's persistence functions. Only the
// service-role client is supplied; no guard or limiter is mocked here.
const admin = createAdminClient();
const DB_CASE_TIMEOUT_MS = 90_000;
const PAGE_CANARY = "projection-preview-canary-3d8a";
const DETAIL_CANARY = "projection-message-canary-5b2e";
const NOTES_CANARY = "projection-notes-canary-9a4f";
const DUE_CANARY = "projection-due-canary-6e0b";
const LINK = "https://github.com/Jacinth091/Tracknologia/issues/12";
const PREVIEW_KEYS = [
  "category",
  "createdAt",
  "id",
  "mayContainContactDetails",
  "participantClass",
  "priority",
  "reviewedAt",
  "rowVersion",
  "source",
  "status",
  "title",
];

async function submitFixture(message: string): Promise<string> {
  const nonce = randomUUID();
  assertSupabaseSuccess(
    await admin.rpc("submit_feedback", {
      p_submission_nonce: nonce,
      p_category: "BUG",
      p_source: "PUBLIC_TRACKING",
      p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      p_title: null,
      p_message: message,
    }),
    "submit projection fixture",
  );
  const { id } = assertSupabaseSuccess(
    await admin
      .from("feedback_submissions")
      .select("id")
      .eq("submission_nonce", nonce)
      .single(),
    "read projection fixture id",
  ).data as { id: string };
  return id;
}

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: "feedback projection integration operator",
    }),
    `provision ${prefix} operator`,
  );
  return created.user.id;
}

async function review(
  feedbackId: string,
  operatorId: string,
  expectedRowVersion: number,
  decision: {
    status: string;
    internalNotes: string | null;
    linkedIssueUrl: string | null;
    reason: string | null;
  },
): Promise<number> {
  return assertSupabaseSuccess(
    await admin.rpc("record_feedback_review", {
      p_feedback_id: feedbackId,
      p_operator_user_id: operatorId,
      p_expected_row_version: expectedRowVersion,
      p_target_status: decision.status,
      p_target_priority: "NORMAL",
      p_internal_notes: decision.internalNotes,
      p_linked_issue_url: decision.linkedIssueUrl,
      p_reason: decision.reason,
    }),
    "record projection review",
  ).data as number;
}

describe("Feedback projections through PostgREST (persistence)", () => {
  it(
    "pages a tied created_at without skipping or duplicating, and keeps previews text-free",
    async () => {
      // A unique far-future instant per run: this run's rows are the only rows
      // at exactly this timestamp, so the cursor starts at their tie group.
      const tied = new Date(
        Date.UTC(2050, 0, 1) + Math.floor(Math.random() * 1e12),
      ).toISOString();
      const ids: string[] = [];
      for (let index = 0; index < 52; index += 1) {
        ids.push(await submitFixture(`${PAGE_CANARY} row ${index}`));
      }
      // One statement moves only this run's fixture ids to the shared instant.
      await runLocalSql(
        testUrl,
        `UPDATE public.feedback_submissions SET created_at = '${tied}'::timestamptz WHERE id IN (${ids.map(sqlUuidLiteral).join(", ")});`,
      );

      const start = `${tied}|ffffffff-ffff-ffff-ffff-ffffffffffff`;
      const first = await listFeedbackPreviews(admin, { cursor: start });
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();

      const second = await listFeedbackPreviews(admin, {
        cursor: first.nextCursor ?? undefined,
      });
      const seen = [...first.items, ...second.items.slice(0, 2)].map(
        (item) => item.id,
      );

      expect(new Set(seen).size).toBe(52);
      expect(new Set(seen)).toEqual(new Set(ids));
      expect(seen).toEqual([...seen].sort().reverse());
      expect(Object.keys(first.items[0]).sort()).toEqual(PREVIEW_KEYS);
      expect(JSON.stringify([first, second])).not.toContain(PAGE_CANARY);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "returns original, review state, and truncated bounded history with null clearing",
    async () => {
      const operatorId = await provisionOperator("feedback-projection-detail");
      const id = await submitFixture(`${DETAIL_CANARY} original text`);

      let version = await review(id, operatorId, 1, {
        status: "REVIEWING",
        internalNotes: NOTES_CANARY,
        linkedIssueUrl: LINK,
        reason: null,
      });
      expect(version).toBe(2);

      // 100 same-status edits bring history to 101 events. The read returns the
      // newest 100, so the oldest event (version 2) is the one left out and the
      // current version (102) must be present. The last edit clears the notes
      // and the link with null.
      for (let index = 0; index < 100; index += 1) {
        const last = index === 99;
        version = await review(id, operatorId, version, {
          status: "REVIEWING",
          internalNotes: last ? null : NOTES_CANARY,
          linkedIssueUrl: last ? null : LINK,
          reason: null,
        });
      }
      expect(version).toBe(102);

      const detail = await readFeedbackDetail(admin, id);
      expect(detail).not.toBeNull();
      expect(Object.keys(detail?.original ?? {}).sort()).toEqual([
        "category",
        "createdAt",
        "id",
        "message",
        "participantClass",
        "source",
        "title",
      ]);
      expect(detail?.original.message).toContain(DETAIL_CANARY);
      expect(detail?.review).toMatchObject({
        status: "REVIEWING",
        priority: "NORMAL",
        internalNotes: null,
        linkedIssueUrl: null,
        rowVersion: 102,
      });

      const history = detail?.history;
      expect(history?.truncated).toBe(true);
      expect(history?.items).toHaveLength(100);
      // Newest 100 by version, presented oldest-first: versions 3 through 102.
      expect(history?.items.map((event) => event.rowVersion)).toEqual(
        Array.from({ length: 100 }, (_, index) => index + 3),
      );
      expect(history?.items.at(-1)).toMatchObject({
        fromStatus: "REVIEWING",
        toStatus: "REVIEWING",
        rowVersion: 102,
      });
      expect(history?.items.some((event) => event.rowVersion === 2)).toBe(
        false,
      );
      const occurred = history?.items.map((event) =>
        Date.parse(event.occurredAt),
      );
      expect(occurred).toEqual([...(occurred ?? [])].sort((a, b) => a - b));
      expect(JSON.stringify(history)).not.toContain(DETAIL_CANARY);
      expect(JSON.stringify(history)).not.toContain(NOTES_CANARY);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "lists only submissions older than 90 days for the due filter",
    async () => {
      const old = await submitFixture(`${DUE_CANARY} old row`);
      const recent = await submitFixture(`${DUE_CANARY} recent row`);
      await runLocalSql(
        testUrl,
        `UPDATE public.feedback_submissions SET created_at = now() - interval '100 days' WHERE id = ${sqlUuidLiteral(old)};`,
      );

      const due = await listFeedbackPreviews(admin, { dueForReview: true });
      const dueIds = due.items.map((item) => item.id);

      expect(dueIds).toContain(old);
      expect(dueIds).not.toContain(recent);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it("returns null for an unknown feedback identifier", async () => {
    await expect(readFeedbackDetail(admin, randomUUID())).resolves.toBeNull();
  });
});
