import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

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

// The owner-run privacy runbook in docs/OPERATIONS.md is executed exactly as
// documented. Only its explicit placeholders are replaced, and the final
// transaction statement is switched to commit only where a test needs the
// committed outcome. Every other assertion reads the database directly.
const admin = createAdminClient();
const DB_CASE_TIMEOUT_MS = 90_000;
const TITLE = "privacy-title-canary-7c1e";
const MESSAGE = "privacy-message-canary-2f9d";
const NOTES = "privacy-notes-canary-5a3b";
const REASON = "privacy-reason-canary-8e4c";
const LINK = "https://github.com/Jacinth091/Tracknologia/issues/12";
const ACTOR_PLACEHOLDER = "<actor-auth-user-uuid>";
const FEEDBACK_PLACEHOLDER = "<feedback-submission-uuid>";
const APPROVAL_PLACEHOLDER = "<approval-ref>";
const APPROVAL = "ISSUE-92-PRIV";

const RUNBOOK_URL = new URL("../../docs/OPERATIONS.md", import.meta.url);

interface FeedbackRow {
  id: string;
  title: string | null;
  message: string;
  internal_notes: string | null;
  linked_issue_url: string | null;
  status: string;
  priority: string;
  row_version: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface PrivacyAuditRow {
  operation: string;
  target_feedback_id: string;
  actor_user_id: string | null;
  approval_ref: string;
}

/** Extracts one fenced sql block by its `-- runbook: <name>` first line. */
function readRunbookBlock(name: string): string {
  const markdown = readFileSync(RUNBOOK_URL, "utf8").replace(/\r\n/g, "\n");
  const pattern = /```sql\n(-- runbook: [^\n]+\n[\s\S]*?)```/g;
  const blocks = [...markdown.matchAll(pattern)]
    .map((match) => match[1])
    .filter((block) => block.startsWith(`-- runbook: ${name}\n`));
  if (blocks.length !== 1) {
    throw new Error(`Expected exactly one runbook block named ${name}`);
  }
  return blocks[0];
}

/** Replaces the documented placeholders with concrete values. */
function fillRunbook(
  block: string,
  values: { feedbackId: string; actorId: string; approvalRef: string },
): string {
  return block
    .replace(FEEDBACK_PLACEHOLDER, values.feedbackId)
    .replace(ACTOR_PLACEHOLDER, values.actorId)
    .replace(APPROVAL_PLACEHOLDER, values.approvalRef);
}

/** Switches the rehearsal default `rollback;` to `commit;`, exactly once. */
function commitRunbook(block: string): string {
  const finals = block.match(/^rollback;$/gm) ?? [];
  if (finals.length !== 1) {
    throw new Error("Runbook must end with exactly one rollback; statement");
  }
  return block.replace(/^rollback;$/m, "commit;");
}

async function readRow(feedbackId: string): Promise<FeedbackRow | null> {
  const output = await runLocalSql(
    testUrl,
    `SELECT coalesce(row_to_json(f)::text, '') FROM (
       SELECT id, title, message, internal_notes, linked_issue_url, status,
              priority, row_version, reviewed_by, reviewed_at
       FROM public.feedback_submissions
       WHERE id = ${sqlUuidLiteral(feedbackId)}
     ) f;`,
  );
  return output === "" ? null : (JSON.parse(output) as FeedbackRow);
}

async function readReviewReasons(feedbackId: string): Promise<unknown[]> {
  const output = await runLocalSql(
    testUrl,
    `SELECT coalesce(json_agg(reason ORDER BY occurred_at, event_id), '[]')
     FROM public.feedback_review_events
     WHERE feedback_id = ${sqlUuidLiteral(feedbackId)};`,
  );
  return JSON.parse(output) as unknown[];
}

async function readPrivacyAudit(
  feedbackId: string,
): Promise<PrivacyAuditRow[]> {
  const output = await runLocalSql(
    testUrl,
    `SELECT coalesce(json_agg(row_to_json(a)), '[]') FROM (
       SELECT operation, target_feedback_id, actor_user_id, approval_ref
       FROM public.feedback_privacy_audit
       WHERE target_feedback_id = ${sqlUuidLiteral(feedbackId)}
       ORDER BY created_at, event_id
     ) a;`,
  );
  return JSON.parse(output) as PrivacyAuditRow[];
}

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: "feedback privacy integration operator",
    }),
    `provision ${prefix} operator`,
  );
  return created.user.id;
}

/** Submits one fixture and reviews it once, so it has row_version 2 and a stamp. */
async function seedReviewedFeedback(operatorId: string): Promise<string> {
  const nonce = randomUUID();
  assertSupabaseSuccess(
    await admin.rpc("submit_feedback", {
      p_submission_nonce: nonce,
      p_category: "BUG",
      p_source: "PUBLIC_TRACKING",
      p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      p_title: TITLE,
      p_message: MESSAGE,
    }),
    "submit privacy fixture",
  );
  const { id } = assertSupabaseSuccess(
    await admin
      .from("feedback_submissions")
      .select("id")
      .eq("submission_nonce", nonce)
      .single(),
    "read privacy fixture id",
  ).data as { id: string };

  assertSupabaseSuccess(
    await admin.rpc("record_feedback_review", {
      p_feedback_id: id,
      p_operator_user_id: operatorId,
      p_expected_row_version: 1,
      p_target_status: "REVIEWING",
      p_target_priority: "HIGH",
      p_internal_notes: NOTES,
      p_linked_issue_url: LINK,
      p_reason: REASON,
    }),
    "review privacy fixture",
  );
  return id;
}

describe("Feedback privacy audit grants (PostgreSQL)", () => {
  it(
    "denies every client write and read path on the privacy audit",
    async () => {
      const output = await runLocalSql(
        testUrl,
        `SELECT json_build_object(
           'anonInsert', has_table_privilege('anon', 'public.feedback_privacy_audit', 'INSERT'),
           'anonSelect', has_table_privilege('anon', 'public.feedback_privacy_audit', 'SELECT'),
           'authInsert', has_table_privilege('authenticated', 'public.feedback_privacy_audit', 'INSERT'),
           'authSelect', has_table_privilege('authenticated', 'public.feedback_privacy_audit', 'SELECT'),
           'serviceInsert', has_table_privilege('service_role', 'public.feedback_privacy_audit', 'INSERT'),
           'serviceUpdate', has_table_privilege('service_role', 'public.feedback_privacy_audit', 'UPDATE'),
           'serviceDelete', has_table_privilege('service_role', 'public.feedback_privacy_audit', 'DELETE'),
           'serviceSelect', has_table_privilege('service_role', 'public.feedback_privacy_audit', 'SELECT')
         );`,
      );
      expect(JSON.parse(output)).toEqual({
        anonInsert: false,
        anonSelect: false,
        authInsert: false,
        authSelect: false,
        serviceInsert: false,
        serviceUpdate: false,
        serviceDelete: false,
        serviceSelect: true,
      });

      const write = await admin.from("feedback_privacy_audit").insert({
        operation: "FEEDBACK_REDACTED",
        target_feedback_id: randomUUID(),
        approval_ref: APPROVAL,
      });
      expect(write.error).not.toBeNull();
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "keeps routine access views as null-reason access events",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-view");
      const eventId = assertSupabaseSuccess(
        await admin.rpc("record_internal_operation_access", {
          p_operator_user_id: operatorId,
          p_operation_category: "INTERNAL_ACCESS_VIEW",
        }),
        "record routine view",
      ).data as string;

      const output = await runLocalSql(
        testUrl,
        `SELECT coalesce(row_to_json(a)::text, '') FROM (
           SELECT operation, reason FROM public.internal_access_audit
           WHERE event_id = ${sqlUuidLiteral(eventId)}
         ) a;`,
      );
      expect(JSON.parse(output)).toEqual({
        operation: "INTERNAL_ACCESS_VIEW",
        reason: null,
      });
    },
    DB_CASE_TIMEOUT_MS,
  );
});

describe("Feedback redaction runbook (PostgreSQL)", () => {
  it(
    "rehearsal default discards every redaction change",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-rehearsal");
      const feedbackId = await seedReviewedFeedback(operatorId);
      const before = await readRow(feedbackId);
      const block = fillRunbook(readRunbookBlock("feedback-redaction"), {
        feedbackId,
        actorId: operatorId,
        approvalRef: APPROVAL,
      });

      await runLocalSql(testUrl, block);

      expect(await readRow(feedbackId)).toEqual(before);
      expect(await readReviewReasons(feedbackId)).toEqual([REASON]);
      expect(await readPrivacyAudit(feedbackId)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "retains the row, status, history and link, and rejects a stale triage form",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-redact");
      const feedbackId = await seedReviewedFeedback(operatorId);
      const before = await readRow(feedbackId);
      expect(before?.row_version).toBe(2);

      const block = fillRunbook(readRunbookBlock("feedback-redaction"), {
        feedbackId,
        actorId: operatorId,
        approvalRef: APPROVAL,
      });
      await runLocalSql(testUrl, commitRunbook(block));

      const after = await readRow(feedbackId);
      expect(after).toMatchObject({
        title: "[redacted]",
        message: "[redacted]",
        internal_notes: null,
        linked_issue_url: LINK,
        status: "REVIEWING",
        priority: "HIGH",
        row_version: 3,
        reviewed_by: operatorId,
      });
      expect(after?.reviewed_at).not.toBeNull();
      expect(JSON.stringify(after)).not.toContain(MESSAGE);
      expect(JSON.stringify(after)).not.toContain(NOTES);

      expect(await readReviewReasons(feedbackId)).toEqual([null]);

      const audit = await readPrivacyAudit(feedbackId);
      expect(audit).toEqual([
        {
          operation: "FEEDBACK_REDACTED",
          target_feedback_id: feedbackId,
          actor_user_id: operatorId,
          approval_ref: APPROVAL,
        },
      ]);

      // A triage form loaded before the redaction carries version 2. It must be
      // rejected, so it cannot restore the erased notes or link.
      const stale = await admin.rpc("record_feedback_review", {
        p_feedback_id: feedbackId,
        p_operator_user_id: operatorId,
        p_expected_row_version: 2,
        p_target_status: "PLANNED",
        p_target_priority: "HIGH",
        p_internal_notes: NOTES,
        p_linked_issue_url: null,
        p_reason: null,
      });
      expect(stale.error?.message).toContain("FEEDBACK_VERSION_CONFLICT");
      expect(await readRow(feedbackId)).toEqual(after);
    },
    DB_CASE_TIMEOUT_MS,
  );
});

describe("Feedback purge runbook (PostgreSQL)", () => {
  it(
    "erases only the approved target and keeps its privacy audit",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-purge");
      const targetId = await seedReviewedFeedback(operatorId);
      const siblingId = await seedReviewedFeedback(operatorId);

      const block = fillRunbook(readRunbookBlock("feedback-purge"), {
        feedbackId: targetId,
        actorId: operatorId,
        approvalRef: APPROVAL,
      });
      await runLocalSql(testUrl, commitRunbook(block));

      expect(await readRow(targetId)).toBeNull();
      expect(await readReviewReasons(targetId)).toEqual([]);
      expect(await readRow(siblingId)).not.toBeNull();
      expect(await readReviewReasons(siblingId)).toEqual([REASON]);

      expect(await readPrivacyAudit(targetId)).toEqual([
        {
          operation: "FEEDBACK_PURGED",
          target_feedback_id: targetId,
          actor_user_id: operatorId,
          approval_ref: APPROVAL,
        },
      ]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rehearsal default leaves the target fully intact",
    async () => {
      const operatorId = await provisionOperator(
        "feedback-privacy-purge-rehearsal",
      );
      const feedbackId = await seedReviewedFeedback(operatorId);
      const before = await readRow(feedbackId);
      const block = fillRunbook(readRunbookBlock("feedback-purge"), {
        feedbackId,
        actorId: operatorId,
        approvalRef: APPROVAL,
      });

      await runLocalSql(testUrl, block);

      expect(await readRow(feedbackId)).toEqual(before);
      expect(await readReviewReasons(feedbackId)).toEqual([REASON]);
    },
    DB_CASE_TIMEOUT_MS,
  );
});

describe("Feedback privacy runbook failure rollback (PostgreSQL)", () => {
  it(
    "rejects a missing target, a malformed target and a malformed approval without writes",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-invalid");
      const feedbackId = await seedReviewedFeedback(operatorId);
      const before = await readRow(feedbackId);
      const redaction = readRunbookBlock("feedback-redaction");
      const purge = readRunbookBlock("feedback-purge");

      const cases = [
        { block: redaction, feedbackId: randomUUID(), approvalRef: APPROVAL },
        { block: purge, feedbackId: randomUUID(), approvalRef: APPROVAL },
        { block: redaction, feedbackId: "not-a-uuid", approvalRef: APPROVAL },
        { block: purge, feedbackId: feedbackId, approvalRef: "bad ref" },
      ];
      for (const testCase of cases) {
        const block = commitRunbook(
          fillRunbook(testCase.block, {
            feedbackId: testCase.feedbackId,
            actorId: operatorId,
            approvalRef: testCase.approvalRef,
          }),
        );
        await expect(runLocalSql(testUrl, block)).rejects.toThrow();
      }

      expect(await readRow(feedbackId)).toEqual(before);
      expect(await readReviewReasons(feedbackId)).toEqual([REASON]);
      expect(await readPrivacyAudit(feedbackId)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rolls back the redaction when the privacy audit insert fails",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-audit-fail");
      const feedbackId = await seedReviewedFeedback(operatorId);
      const before = await readRow(feedbackId);
      const block = commitRunbook(
        fillRunbook(readRunbookBlock("feedback-redaction"), {
          feedbackId,
          actorId: randomUUID(),
          approvalRef: APPROVAL,
        }),
      );

      await expect(runLocalSql(testUrl, block)).rejects.toThrow();

      expect(await readRow(feedbackId)).toEqual(before);
      expect(await readPrivacyAudit(feedbackId)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rolls back the purge when the privacy audit insert fails",
    async () => {
      const operatorId = await provisionOperator("feedback-privacy-purge-fail");
      const feedbackId = await seedReviewedFeedback(operatorId);
      const before = await readRow(feedbackId);
      const block = commitRunbook(
        fillRunbook(readRunbookBlock("feedback-purge"), {
          feedbackId,
          actorId: randomUUID(),
          approvalRef: APPROVAL,
        }),
      );

      await expect(runLocalSql(testUrl, block)).rejects.toThrow();

      expect(await readRow(feedbackId)).toEqual(before);
      expect(await readReviewReasons(feedbackId)).toEqual([REASON]);
      expect(await readPrivacyAudit(feedbackId)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );
});
