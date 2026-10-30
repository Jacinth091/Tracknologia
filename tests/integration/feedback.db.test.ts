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
import {
  checkPublicOperationLimit,
  expectRpcPermissionDenied,
  opaqueActorKey,
} from "./helpers/shared-test-utils";
import {
  openLocalSqlSession,
  runLocalSql,
  sqlUuidLiteral,
  waitUntilBlockedBy,
  type LocalSqlSession,
} from "../helpers/local-postgres";

requireDbConfig();

const admin = createAdminClient();
// Docker-backed psql sessions and one-shot queries exceed the default 5 s case
// timeout, so every case in this file states this bound explicitly.
const DB_CASE_TIMEOUT_MS = 60_000;
const REVIEW_REASON = "feedback review integration operator";
const ROLES = ["anon", "authenticated", "service_role"] as const;
const SUBMIT_SIGNATURE =
  "public.submit_feedback(uuid,text,text,text,text,text)";
const REVIEW_SIGNATURE =
  "public.record_feedback_review(uuid,uuid,integer,text,text,text,text,text)";
const LIMIT_SIGNATURE =
  "public.check_public_operation_rate_limit(text,text,integer,integer,integer)";
const LOOKUP_SIGNATURE = "public.lookup_public_repair(text)";
// Must match scripts/rehearse-upgrade-fixture.sql exactly.
const UPGRADE = {
  providerId: "00000000-0000-4000-8000-00000000d001",
  requestId: "00000000-0000-4000-8000-00000000e001",
  repairId: "00000000-0000-4000-8000-00000000f001",
  trackingKey:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  repairKey: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
};
const SUBMISSION_KEYS = [
  "category",
  "created_at",
  "id",
  "internal_notes",
  "linked_issue_url",
  "message",
  "participant_class",
  "priority",
  "privacy_reviewed_at",
  "reviewed_at",
  "reviewed_by",
  "row_version",
  "source",
  "status",
  "submission_nonce",
  "title",
];
const EVENT_KEYS = [
  "event_id",
  "feedback_id",
  "from_status",
  "occurred_at",
  "operator_user_id",
  "priority_after",
  "priority_before",
  "reason",
  "row_version",
  "to_status",
];

// CASE expressions yield "1"/"0" text. Concatenating raw booleans would render
// as true/false, not the psql t/f this matrix is compared against.
function bits(predicates: string[]): string {
  return predicates
    .map((predicate) => `CASE WHEN ${predicate} THEN '1' ELSE '0' END`)
    .join(" || ");
}

// Matrix order: each role's SELECT, INSERT, UPDATE, DELETE.
async function tableGrantBits(table: string): Promise<string> {
  const predicates = ROLES.flatMap((role) =>
    ["SELECT", "INSERT", "UPDATE", "DELETE"].map(
      (privilege) =>
        `has_table_privilege('${role}', '${table}', '${privilege}')`,
    ),
  );
  return runLocalSql(testUrl, `SELECT ${bits(predicates)};`);
}

// Matrix order: anon, authenticated, service_role EXECUTE.
async function functionGrantBits(signature: string): Promise<string> {
  const predicates = ROLES.map(
    (role) => `has_function_privilege('${role}', '${signature}', 'EXECUTE')`,
  );
  return runLocalSql(testUrl, `SELECT ${bits(predicates)};`);
}

function submitInput(overrides: Record<string, unknown> = {}) {
  return {
    p_submission_nonce: randomUUID(),
    p_category: "BUG",
    p_source: "PUBLIC_TRACKING",
    p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
    p_title: null,
    p_message: "The tracking page shows an error.",
    ...overrides,
  };
}

async function readByNonce(nonce: string) {
  return (
    assertSupabaseSuccess(
      await admin
        .from("feedback_submissions")
        .select("*")
        .eq("submission_nonce", nonce),
      "read feedback by nonce",
    ).data ?? []
  );
}

async function readByMessage(message: string) {
  return (
    assertSupabaseSuccess(
      await admin
        .from("feedback_submissions")
        .select("*")
        .eq("message", message),
      "read feedback by message",
    ).data ?? []
  );
}

async function createFeedback(overrides: Record<string, unknown> = {}) {
  const nonce = randomUUID();
  assertSupabaseSuccess(
    await admin.rpc(
      "submit_feedback",
      submitInput({ p_submission_nonce: nonce, ...overrides }),
    ),
    "submit feedback fixture",
  );
  const [row] = await readByNonce(nonce);
  return row;
}

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: REVIEW_REASON,
    }),
    `provision ${prefix} operator`,
  );
  return created.user.id;
}

function reviewInput(
  feedbackId: string,
  operatorId: string,
  expectedVersion: number,
  targetStatus: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    p_feedback_id: feedbackId,
    p_operator_user_id: operatorId,
    p_expected_row_version: expectedVersion,
    p_target_status: targetStatus,
    p_target_priority: "NORMAL",
    p_internal_notes: null,
    p_linked_issue_url: null,
    p_reason: null,
    ...overrides,
  };
}

async function readHistory(feedbackId: string) {
  return (
    assertSupabaseSuccess(
      await admin
        .from("feedback_review_events")
        .select("*")
        .eq("feedback_id", feedbackId)
        .order("occurred_at", { ascending: true })
        .order("event_id", { ascending: true }),
      "read feedback review history",
    ).data ?? []
  );
}

// Runs a review inside a DO block that captures the outcome instead of raising,
// so a persistent psql session survives an expected rejection (psql runs with
// ON_ERROR_STOP and would otherwise end the session).
function captureReviewSql(call: string): string {
  return `DO $$ BEGIN PERFORM ${call}; PERFORM set_config('test.review_outcome', 'OK', false); EXCEPTION WHEN OTHERS THEN PERFORM set_config('test.review_outcome', SQLERRM, false); END $$; SELECT current_setting('test.review_outcome');`;
}

function reviewCallSql(
  feedbackId: string,
  operatorId: string,
  expectedVersion: number,
  targetStatus: string,
): string {
  return `public.record_feedback_review(${sqlUuidLiteral(feedbackId)}, ${sqlUuidLiteral(operatorId)}, ${expectedVersion}, '${targetStatus}', 'NORMAL', NULL, NULL, NULL)`;
}

async function withSessions<T>(
  run: (open: () => Promise<LocalSqlSession>) => Promise<T>,
): Promise<T> {
  const opened: LocalSqlSession[] = [];
  try {
    return await run(async () => {
      const session = await openLocalSqlSession(testUrl);
      opened.push(session);
      return session;
    });
  } finally {
    await Promise.allSettled(opened.map((session) => session.close()));
  }
}

async function backendPid(session: LocalSqlSession): Promise<number> {
  return Number(await session.query("SELECT pg_backend_pid();"));
}

describe("Feedback private persistence (PostgreSQL)", () => {
  // Reviewer identities stay: review history references them with ON DELETE
  // RESTRICT by design, so their Auth deletion is refused (tested below).

  it(
    "keeps private tables and the submit/review RPCs away from client roles",
    async () => {
      const anon = createAnonClient();
      const user = await createTestUser(admin, uniqueEmail("feedback-denial"));
      const auth = await signInTestUser(user.email, user.password);

      for (const client of [anon, auth.client]) {
        const rows = await client.from("feedback_submissions").select("id");
        expect(rows.error).toMatchObject({ code: "42501" });
        const events = await client
          .from("feedback_review_events")
          .select("event_id");
        expect(events.error).toMatchObject({ code: "42501" });
        expectRpcPermissionDenied(
          await client.rpc("submit_feedback", submitInput()),
        );
        expectRpcPermissionDenied(
          await client.rpc(
            "record_feedback_review",
            reviewInput(randomUUID(), randomUUID(), 1, "REVIEWING"),
          ),
        );
      }

      // service_role is granted SELECT only, so every direct write bypassing the
      // RPCs (and their history) is denied even for the privileged client.
      const submissionWrites = [
        admin.from("feedback_submissions").insert({
          submission_nonce: randomUUID(),
          category: "BUG",
          source: "PUBLIC_TRACKING",
          participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
          message: "Direct write attempt",
        }),
        admin
          .from("feedback_submissions")
          .update({ status: "DISMISSED" })
          .eq("submission_nonce", randomUUID()),
        admin
          .from("feedback_submissions")
          .delete()
          .eq("submission_nonce", randomUUID()),
      ];
      const eventWrites = [
        admin.from("feedback_review_events").insert({
          feedback_id: randomUUID(),
          operator_user_id: randomUUID(),
          from_status: "NEW",
          to_status: "REVIEWING",
          priority_before: "NORMAL",
          priority_after: "NORMAL",
          row_version: 2,
        }),
        admin
          .from("feedback_review_events")
          .update({ reason: "Rewritten history" })
          .eq("event_id", randomUUID()),
        admin
          .from("feedback_review_events")
          .delete()
          .eq("event_id", randomUUID()),
      ];
      for (const write of [...submissionWrites, ...eventWrites]) {
        expect(await write).toMatchObject({ error: { code: "42501" } });
      }
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "grants exactly the intended privileges on both tables and every new function",
    async () => {
      // anon | authenticated | service_role, each as SELECT INSERT UPDATE DELETE.
      expect(await tableGrantBits("public.feedback_submissions")).toBe(
        "000000001000",
      );
      expect(await tableGrantBits("public.feedback_review_events")).toBe(
        "000000001000",
      );

      expect(await functionGrantBits(SUBMIT_SIGNATURE)).toBe("001");
      expect(await functionGrantBits(REVIEW_SIGNATURE)).toBe("001");
      expect(await functionGrantBits(LIMIT_SIGNATURE)).toBe("001");
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "accepts every valid category, source and participant-class combination once with server defaults",
    async () => {
      const categories = ["BUG", "USABILITY", "FEATURE_REQUEST", "GENERAL"];
      const pairs = [
        ["PUBLIC_TRACKING", "PUBLIC_SELF_REPORTED_CUSTOMER"],
        ["PUBLIC_REQUEST", "PUBLIC_SELF_REPORTED_CUSTOMER"],
        ["PUBLIC_FEEDBACK", "PUBLIC_SELF_REPORTED_CUSTOMER"],
        ["PROVIDER_WORKSPACE", "SHOP_OWNER"],
        ["PROVIDER_WORKSPACE", "SHOP_STAFF"],
        ["PROVIDER_WORKSPACE", "INDEPENDENT_REPAIRER"],
      ];

      for (const category of categories) {
        for (const [source, participantClass] of pairs) {
          const nonce = randomUUID();
          const receipt = assertSupabaseSuccess(
            await admin.rpc(
              "submit_feedback",
              submitInput({
                p_submission_nonce: nonce,
                p_category: category,
                p_source: source,
                p_participant_class: participantClass,
              }),
            ),
            `submit ${category} from ${source}`,
          );
          expect(receipt.data).toBe("ACCEPTED");

          const [row] = await readByNonce(nonce);
          expect(row).toMatchObject({
            category,
            source,
            participant_class: participantClass,
            status: "NEW",
            priority: "NORMAL",
            row_version: 1,
            privacy_reviewed_at: null,
            reviewed_at: null,
            reviewed_by: null,
          });
          expect(Object.keys(row).sort()).toEqual([...SUBMISSION_KEYS].sort());
        }
      }
    },
    DB_CASE_TIMEOUT_MS,
  );

  it.each([
    ["null nonce", { p_submission_nonce: null }],
    ["null category", { p_category: null }],
    ["null source", { p_source: null }],
    ["null participant class", { p_participant_class: null }],
    ["null message", { p_message: null }],
    ["whitespace-only message", { p_message: " \t\r\n\f\v " }],
    ["message over 2,000 characters", { p_message: "x".repeat(2001) }],
    ["title over 120 characters", { p_title: "t".repeat(121) }],
    ["control character in message", { p_message: "bad\u0001text" }],
    ["unknown category", { p_category: "OTHER" }],
    [
      "public source with a Provider class",
      { p_source: "PUBLIC_REQUEST", p_participant_class: "SHOP_OWNER" },
    ],
    [
      "Provider source with the public class",
      {
        p_source: "PROVIDER_WORKSPACE",
        p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      },
    ],
  ])(
    "rejects %s without creating a row",
    async (_name, overrides) => {
      const nonce = randomUUID();
      const marker = `rejected ${randomUUID()}`;
      const result = await admin.rpc(
        "submit_feedback",
        submitInput({
          p_submission_nonce: nonce,
          p_message: marker,
          ...overrides,
        }),
      );
      expect(result.error).not.toBeNull();
      expect(await readByNonce(nonce)).toEqual([]);
      expect(await readByMessage(marker)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rejects an invalid retry on an existing nonce and leaves the original unchanged",
    async () => {
      const nonce = randomUUID();
      assertSupabaseSuccess(
        await admin.rpc(
          "submit_feedback",
          submitInput({
            p_submission_nonce: nonce,
            p_message: "Original text",
          }),
        ),
        "submit original before invalid retry",
      );

      const invalidRetry = await admin.rpc(
        "submit_feedback",
        submitInput({
          p_submission_nonce: nonce,
          p_category: "OTHER",
          p_message: "Invalid retry text",
        }),
      );
      expect(invalidRetry.error).not.toBeNull();

      const rows = await readByNonce(nonce);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: "BUG",
        message: "Original text",
      });
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rejects an invalid row even from a privileged database session",
    async () => {
      await expect(
        runLocalSql(
          testUrl,
          `INSERT INTO public.feedback_submissions (submission_nonce, category, source, participant_class, message) VALUES ('${randomUUID()}', 'BUG', 'PUBLIC_REQUEST', 'SHOP_OWNER', 'direct');`,
        ),
      ).rejects.toThrow(/feedback_submissions_source_class_pair_check/);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "counts PostgreSQL characters and trims only ASCII edge whitespace",
    async () => {
      const maximal = "😀".repeat(2000);
      const accepted = await createFeedback({ p_message: maximal });
      expect(accepted.message).toBe(maximal);

      const rejectedNonce = randomUUID();
      const oversized = await admin.rpc(
        "submit_feedback",
        submitInput({
          p_submission_nonce: rejectedNonce,
          p_message: "😀".repeat(2001),
        }),
      );
      expect(oversized.error).not.toBeNull();
      expect(await readByNonce(rejectedNonce)).toEqual([]);

      const trimmed = await createFeedback({
        p_title: "  Spaced title \t",
        p_message: "\n  Trimmed message \r\f\v",
      });
      expect(trimmed.title).toBe("Spaced title");
      expect(trimmed.message).toBe("Trimmed message");

      // Non-ASCII whitespace (NBSP) is content, not trimmable edge whitespace.
      const nbsp = await createFeedback({ p_message: " kept " });
      expect(nbsp.message).toBe(" kept ");

      const blankTitle = await createFeedback({ p_title: " \t " });
      expect(blankTitle.title).toBeNull();
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "makes a same-nonce retry a no-op that never changes or discloses the original",
    async () => {
      const nonce = randomUUID();
      const first = await admin.rpc(
        "submit_feedback",
        submitInput({ p_submission_nonce: nonce, p_message: "Original text" }),
      );
      const retry = await admin.rpc(
        "submit_feedback",
        submitInput({ p_submission_nonce: nonce, p_message: "Changed text" }),
      );

      expect(first.data).toBe("ACCEPTED");
      expect(retry.data).toBe("ACCEPTED");
      const rows = await readByNonce(nonce);
      expect(rows).toHaveLength(1);
      expect(rows[0].message).toBe("Original text");
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "serializes overlapping same-nonce submissions into one durable row",
    async () => {
      await withSessions(async (open) => {
        const control = await open();
        const holder = await open();
        const second = await open();
        const holderPid = await backendPid(holder);
        const secondPid = await backendPid(second);

        const nonce = randomUUID();
        const nonceLiteral = sqlUuidLiteral(nonce);
        const submit = (message: string) =>
          `SELECT public.submit_feedback(${nonceLiteral}, 'BUG', 'PUBLIC_TRACKING', 'PUBLIC_SELF_REPORTED_CUSTOMER', NULL, '${message}');`;

        // The holder's insert is uncommitted, so the unique nonce is in flight.
        expect(
          await holder.query(`BEGIN; ${submit("Concurrent original")}`),
        ).toBe("ACCEPTED");

        let secondSettled = false;
        const secondOutcome = second
          .query(submit("Concurrent retry"))
          .then((output) => {
            secondSettled = true;
            return output;
          });
        secondOutcome.catch(() => undefined);

        await waitUntilBlockedBy(control, secondPid, holderPid);
        expect(secondSettled).toBe(false);

        await holder.query("COMMIT;");
        expect(await secondOutcome).toBe("ACCEPTED");

        const rows = await readByNonce(nonce);
        expect(rows).toHaveLength(1);
        expect(rows[0].message).toBe("Concurrent original");
      });
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "applies a versioned review atomically and appends exactly one history event",
    async () => {
      const operatorId = await provisionOperator("feedback-review-happy");
      const feedback = await createFeedback();

      const version = assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 1, "REVIEWING", {
            p_target_priority: "HIGH",
            p_internal_notes: "Internal triage note",
            p_linked_issue_url:
              "https://github.com/Jacinth091/Tracknologia/issues/89",
          }),
        ),
        "review feedback",
      );
      expect(version.data).toBe(2);

      const [reviewed] = await readByNonce(feedback.submission_nonce);
      expect(reviewed).toMatchObject({
        status: "REVIEWING",
        priority: "HIGH",
        row_version: 2,
        reviewed_by: operatorId,
        internal_notes: "Internal triage note",
        linked_issue_url:
          "https://github.com/Jacinth091/Tracknologia/issues/89",
        message: feedback.message,
        title: feedback.title,
        category: feedback.category,
        source: feedback.source,
        participant_class: feedback.participant_class,
      });

      const history = await readHistory(feedback.id);
      expect(history).toHaveLength(1);
      expect(Object.keys(history[0]).sort()).toEqual([...EVENT_KEYS].sort());
      expect(history[0]).toMatchObject({
        from_status: "NEW",
        to_status: "REVIEWING",
        priority_before: "NORMAL",
        priority_after: "HIGH",
        row_version: 2,
        reason: null,
      });
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "records a same-status edit as a version bump and a history event",
    async () => {
      const operatorId = await provisionOperator("feedback-review-same-status");
      const feedback = await createFeedback();
      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 1, "REVIEWING"),
        ),
        "enter REVIEWING",
      );

      const edited = assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 2, "REVIEWING", {
            p_target_priority: "CRITICAL",
            p_internal_notes: "Escalated internally",
          }),
        ),
        "same-status review edit",
      );
      expect(edited.data).toBe(3);

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({
        status: "REVIEWING",
        priority: "CRITICAL",
        row_version: 3,
        internal_notes: "Escalated internally",
      });

      const history = await readHistory(feedback.id);
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({
        from_status: "REVIEWING",
        to_status: "REVIEWING",
        priority_before: "NORMAL",
        priority_after: "CRITICAL",
        row_version: 3,
      });
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rejects a stale version, an illegal transition and an unexplained reopen without writing",
    async () => {
      const operatorId = await provisionOperator("feedback-review-guards");
      const feedback = await createFeedback();

      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 1, "REVIEWING"),
        ),
        "first review",
      );

      const stale = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 1, "REVIEWING"),
      );
      expect(stale.error?.message).toContain("FEEDBACK_VERSION_CONFLICT");

      const illegal = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 2, "NEW"),
      );
      expect(illegal.error?.message).toContain("FEEDBACK_INVALID_TRANSITION");

      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 2, "RESOLVED"),
        ),
        "resolve feedback",
      );

      const unexplained = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 3, "REVIEWING"),
      );
      expect(unexplained.error?.message).toContain("FEEDBACK_REASON_REQUIRED");

      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 3, "REVIEWING", {
            p_reason: "New evidence arrived",
          }),
        ),
        "reopen feedback with a reason",
      );

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({ status: "REVIEWING", row_version: 4 });

      const history = await readHistory(feedback.id);
      expect(history.map((event) => event.to_status)).toEqual([
        "REVIEWING",
        "RESOLVED",
        "REVIEWING",
      ]);
      expect(history.map((event) => event.row_version)).toEqual([2, 3, 4]);
      expect(history[2].reason).toBe("New evidence arrived");
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "refuses a review when the operator has no internal mapping at all",
    async () => {
      const unmapped = await createTestUser(
        admin,
        uniqueEmail("feedback-unmapped"),
      );
      const feedback = await createFeedback();

      const denied = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, unmapped.user.id, 1, "REVIEWING"),
      );
      expect(denied.error?.message).toContain(
        "Internal operator access required",
      );

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({ status: "NEW", row_version: 1 });
      expect(await readHistory(feedback.id)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "refuses a review from a revoked operator and leaves the row and history unchanged",
    async () => {
      const operatorId = await provisionOperator("feedback-review-revoked");
      const feedback = await createFeedback();
      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 1, "REVIEWING"),
        ),
        "review before revocation",
      );
      assertSupabaseSuccess(
        await admin.rpc("change_internal_operator_access", {
          p_operator_user_id: operatorId,
          p_actor_user_id: operatorId,
          p_enabled: false,
          p_reason: REVIEW_REASON,
        }),
        "revoke reviewer",
      );

      const denied = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 2, "PLANNED"),
      );
      expect(denied.error?.message).toContain(
        "Internal operator access required",
      );

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({ status: "REVIEWING", row_version: 2 });
      expect(await readHistory(feedback.id)).toHaveLength(1);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rejects an invalid priority and leaves the row and history unchanged",
    async () => {
      const operatorId = await provisionOperator("feedback-review-priority");
      const feedback = await createFeedback();

      const invalid = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 1, "REVIEWING", {
          p_target_priority: "URGENT",
        }),
      );
      expect(invalid.error?.message).toContain(
        "feedback_submissions_priority_check",
      );

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({
        status: "NEW",
        priority: "NORMAL",
        row_version: 1,
      });
      expect(await readHistory(feedback.id)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rolls back a review whose notes or reason are malformed, with no half-written history",
    async () => {
      const operatorId = await provisionOperator("feedback-review-bounds");
      const feedback = await createFeedback();
      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 1, "REVIEWING"),
        ),
        "enter REVIEWING",
      );
      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 2, "RESOLVED"),
        ),
        "resolve before malformed reopen",
      );

      const oversizedNotes = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 3, "RESOLVED", {
          p_internal_notes: "n".repeat(2001),
        }),
      );
      expect(oversizedNotes.error?.message).toContain(
        "feedback_submissions_internal_notes_check",
      );

      // The reason passes the RPC's presence check, so the history CHECK is what
      // rejects it; the row update made earlier in that call must roll back.
      for (const reason of ["r".repeat(501), "ab"]) {
        const malformedReopen = await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 3, "REVIEWING", {
            p_reason: reason,
          }),
        );
        expect(malformedReopen.error?.message).toContain(
          "feedback_review_events_reason_check",
        );
      }

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({
        status: "RESOLVED",
        row_version: 3,
        internal_notes: null,
      });
      expect(await readHistory(feedback.id)).toHaveLength(2);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it.each([
    [
      "a trailing slash",
      "https://github.com/Jacinth091/Tracknologia/issues/89/",
    ],
    [
      "a query string",
      "https://github.com/Jacinth091/Tracknologia/issues/89?x=1",
    ],
    ["a fragment", "https://github.com/Jacinth091/Tracknologia/issues/89#top"],
    ["another repository", "https://github.com/other/Tracknologia/issues/89"],
    ["another host", "https://example.com/Jacinth091/Tracknologia/issues/89"],
    ["plain HTTP", "http://github.com/Jacinth091/Tracknologia/issues/89"],
    ["issue zero", "https://github.com/Jacinth091/Tracknologia/issues/0"],
    [
      "an overlong issue number",
      `https://github.com/Jacinth091/Tracknologia/issues/${"9".repeat(2000)}`,
    ],
  ])(
    "rejects a linked issue URL with %s and leaves the row unchanged",
    async (_name, linkedIssueUrl) => {
      const operatorId = await provisionOperator("feedback-review-link");
      const feedback = await createFeedback();

      const rejected = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 1, "REVIEWING", {
          p_linked_issue_url: linkedIssueUrl,
        }),
      );
      expect(rejected.error?.message).toContain(
        "feedback_submissions_linked_issue_url_check",
      );

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({
        status: "NEW",
        row_version: 1,
        linked_issue_url: null,
      });
      expect(await readHistory(feedback.id)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "refuses to delete a reviewer whose identity is referenced by review history",
    async () => {
      const operatorId = await provisionOperator("feedback-review-restrict");
      const feedback = await createFeedback();
      assertSupabaseSuccess(
        await admin.rpc(
          "record_feedback_review",
          reviewInput(feedback.id, operatorId, 1, "REVIEWING"),
        ),
        "review before deletion attempt",
      );

      const deleted = await admin.auth.admin.deleteUser(operatorId);
      expect(deleted.error).not.toBeNull();

      const stillPresent = assertSupabaseSuccess(
        await admin
          .from("internal_operators")
          .select("user_id")
          .eq("user_id", operatorId),
        "read reviewer mapping after refused deletion",
      );
      expect(stillPresent.data).toHaveLength(1);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "serializes two reviewers on the same version: one commits, the other conflicts",
    async () => {
      const firstOperator = await provisionOperator("feedback-overlap-first");
      const secondOperator = await provisionOperator("feedback-overlap-second");
      const feedback = await createFeedback();

      await withSessions(async (open) => {
        const control = await open();
        const holder = await open();
        const second = await open();
        const holderPid = await backendPid(holder);
        const secondPid = await backendPid(second);

        expect(
          await holder.query(
            `BEGIN; SELECT ${reviewCallSql(feedback.id, firstOperator, 1, "REVIEWING")};`,
          ),
        ).toBe("2");

        let secondSettled = false;
        const secondOutcome = second
          .query(
            captureReviewSql(
              reviewCallSql(feedback.id, secondOperator, 1, "REVIEWING"),
            ),
          )
          .then((output) => {
            secondSettled = true;
            return output;
          });
        secondOutcome.catch(() => undefined);

        await waitUntilBlockedBy(control, secondPid, holderPid);
        expect(secondSettled).toBe(false);

        await holder.query("COMMIT;");
        expect(await secondOutcome).toBe("FEEDBACK_VERSION_CONFLICT");
      });

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({
        status: "REVIEWING",
        row_version: 2,
        reviewed_by: firstOperator,
      });
      expect(await readHistory(feedback.id)).toHaveLength(1);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "orders an in-flight review before a revocation, then denies later reviews",
    async () => {
      const operatorId = await provisionOperator("feedback-overlap-revoke");
      const feedback = await createFeedback();

      await withSessions(async (open) => {
        const control = await open();
        const holder = await open();
        const revoker = await open();
        const holderPid = await backendPid(holder);
        const revokerPid = await backendPid(revoker);
        const id = sqlUuidLiteral(operatorId);

        // The review holds the operator mapping in shared mode until commit.
        expect(
          await holder.query(
            `BEGIN; SELECT ${reviewCallSql(feedback.id, operatorId, 1, "REVIEWING")};`,
          ),
        ).toBe("2");

        let revokeSettled = false;
        const revokeOutcome = revoker
          .query(
            `BEGIN; SELECT public.change_internal_operator_access(${id}, ${id}, false, '${REVIEW_REASON}'); COMMIT;`,
          )
          .then((output) => {
            revokeSettled = true;
            return output;
          });
        revokeOutcome.catch(() => undefined);

        await waitUntilBlockedBy(control, revokerPid, holderPid);
        expect(revokeSettled).toBe(false);

        await holder.query("COMMIT;");
        expect(await revokeOutcome).toBe("t");
      });

      const denied = await admin.rpc(
        "record_feedback_review",
        reviewInput(feedback.id, operatorId, 2, "PLANNED"),
      );
      expect(denied.error?.message).toContain(
        "Internal operator access required",
      );
      expect(await readHistory(feedback.id)).toHaveLength(1);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rolls back the whole review when its history event cannot be written",
    async () => {
      const operatorId = await provisionOperator("feedback-review-fault");
      const feedback = await createFeedback();

      // Test-only fault: a trigger that rejects history inserts. It exists only
      // inside this rolled-back transaction, so no committed schema changes.
      const outcome = await withSessions(async (open) => {
        const holder = await open();
        const sql = [
          "BEGIN;",
          "CREATE FUNCTION public.feedback_review_fault_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FAULT_INJECTED'; END; $$;",
          "CREATE TRIGGER feedback_review_fault_probe BEFORE INSERT ON public.feedback_review_events FOR EACH ROW EXECUTE FUNCTION public.feedback_review_fault_probe();",
          captureReviewSql(
            reviewCallSql(feedback.id, operatorId, 1, "REVIEWING"),
          ),
          `SELECT (SELECT row_version FROM public.feedback_submissions WHERE id = ${sqlUuidLiteral(feedback.id)});`,
          "ROLLBACK;",
        ].join("\n");
        return holder.query(sql);
      });

      const [capturedOutcome, versionAfterFault] = outcome.split("\n");
      expect(capturedOutcome).toBe("FAULT_INJECTED");
      expect(versionAfterFault).toBe("1");

      const [current] = await readByNonce(feedback.submission_nonce);
      expect(current).toMatchObject({
        status: "NEW",
        row_version: 1,
        reviewed_by: null,
      });
      expect(await readHistory(feedback.id)).toEqual([]);
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "keeps Feedback and Request budgets independent after Feedback exhaustion",
    async () => {
      const actorKey = opaqueActorKey("feedback-budget");
      const attempts = await Promise.all(
        Array.from({ length: 12 }, () =>
          checkPublicOperationLimit(admin, {
            operation: "feedback_submit",
            actorKey,
            windowSeconds: 600,
            maxRequests: 5,
          }),
        ),
      );
      const rows = attempts.map((attempt) => {
        const successful = assertSupabaseSuccess(
          attempt,
          "consume feedback budget",
        );
        return Array.isArray(successful.data)
          ? successful.data[0]
          : successful.data;
      });
      expect(rows.filter((row) => row?.allowed)).toHaveLength(5);
      expect(rows.filter((row) => !row?.allowed)).toHaveLength(7);

      const tracking = assertSupabaseSuccess(
        await checkPublicOperationLimit(admin, {
          operation: "tracking_lookup",
          actorKey,
          windowSeconds: 60,
          maxRequests: 30,
        }),
        "check tracking budget after feedback exhaustion",
      );
      const trackingRow = Array.isArray(tracking.data)
        ? tracking.data[0]
        : tracking.data;
      expect(trackingRow).toMatchObject({ allowed: true, request_count: 1 });

      const request = assertSupabaseSuccess(
        await checkPublicOperationLimit(admin, {
          operation: "repair_request_submit",
          actorKey,
          windowSeconds: 600,
          maxRequests: 5,
        }),
        "check Repair Request budget after feedback exhaustion",
      );
      const requestRow = Array.isArray(request.data)
        ? request.data[0]
        : request.data;
      expect(requestRow).toMatchObject({ allowed: true, request_count: 1 });

      const unknown = await admin.rpc("check_public_operation_rate_limit", {
        p_operation: "feedback_submit_unknown",
        p_actor_key: actorKey,
        p_window_seconds: 600,
        p_max_requests: 5,
        p_cleanup_limit: 0,
      });
      expect(unknown.error?.message).toContain("INVALID_RATE_LIMIT_OPERATION");
    },
    DB_CASE_TIMEOUT_MS,
  );
});

// Runs only after scripts/rehearse-pending-migrations.sh seeded old-state data
// on the base history and applied the pending migrations on top of it. Every
// value below is compared exactly against the seeded fixture.
describe.runIf(process.env.REHEARSAL_UPGRADE_FIXTURE === "1")(
  "pending-only upgrade preserves old-state data",
  () => {
    it(
      "keeps the seeded Provider, Request and Repair exactly unchanged",
      async () => {
        const provider = assertSupabaseSuccess(
          await admin
            .from("providers")
            .select("id, display_name, slug, provider_type")
            .eq("id", UPGRADE.providerId)
            .single(),
          "read seeded Provider after upgrade",
        );
        expect(provider.data).toEqual({
          id: UPGRADE.providerId,
          display_name: "Rehearsal Upgrade Provider",
          slug: "rehearsal-upgrade-provider",
          provider_type: "SHOP",
        });

        const request = assertSupabaseSuccess(
          await admin
            .from("repair_requests")
            .select(
              "id, provider_id, reference_code, customer_name, customer_phone, device_type, reported_problem, status",
            )
            .eq("id", UPGRADE.requestId)
            .single(),
          "read seeded Repair Request after upgrade",
        );
        expect(request.data).toEqual({
          id: UPGRADE.requestId,
          provider_id: UPGRADE.providerId,
          reference_code: "REQ-0123456789ABCDEF",
          customer_name: "Rehearsal Customer",
          customer_phone: "+63 900 000 0001",
          device_type: "Laptop",
          reported_problem: "Rehearsal reported problem",
          status: "SUBMITTED",
        });

        const repair = assertSupabaseSuccess(
          await admin
            .from("repairs")
            .select(
              "id, provider_id, repair_request_id, origin, ticket_number, tracking_code, customer_name, current_status, created_by_user_id",
            )
            .eq("id", UPGRADE.repairId)
            .single(),
          "read seeded Repair after upgrade",
        );
        expect(repair.data).toEqual({
          id: UPGRADE.repairId,
          provider_id: UPGRADE.providerId,
          repair_request_id: UPGRADE.requestId,
          origin: "CUSTOMER_REQUEST",
          ticket_number: "TN-2026-ABCDEF0123",
          tracking_code: "TRK-0123456789ABCDEF01234567",
          customer_name: "Rehearsal Customer",
          current_status: "IN_PROGRESS",
          created_by_user_id: "00000000-0000-4000-8000-00000000c001",
        });
      },
      DB_CASE_TIMEOUT_MS,
    );

    it(
      "continues both seeded counters exactly, keeps the new budget independent, and keeps old grants",
      async () => {
        const seeded = async (operation: string, actorKey: string) =>
          assertSupabaseSuccess(
            await admin
              .from("public_operation_rate_limits")
              .select("request_count")
              .eq("operation", operation)
              .eq("actor_key", actorKey)
              .single(),
            `read seeded ${operation} counter`,
          ).data;

        expect(await seeded("tracking_lookup", UPGRADE.trackingKey)).toEqual({
          request_count: 3,
        });
        expect(
          await seeded("repair_request_submit", UPGRADE.repairKey),
        ).toEqual({
          request_count: 2,
        });

        const tracking = assertSupabaseSuccess(
          await checkPublicOperationLimit(admin, {
            operation: "tracking_lookup",
            actorKey: UPGRADE.trackingKey,
            windowSeconds: 60,
            maxRequests: 30,
          }),
          "continue seeded tracking counter after upgrade",
        );
        const trackingRow = Array.isArray(tracking.data)
          ? tracking.data[0]
          : tracking.data;
        expect(trackingRow).toMatchObject({ allowed: true, request_count: 4 });

        const repair = assertSupabaseSuccess(
          await checkPublicOperationLimit(admin, {
            operation: "repair_request_submit",
            actorKey: UPGRADE.repairKey,
            windowSeconds: 600,
            maxRequests: 5,
          }),
          "continue seeded Repair Request counter after upgrade",
        );
        const repairRow = Array.isArray(repair.data)
          ? repair.data[0]
          : repair.data;
        expect(repairRow).toMatchObject({ allowed: true, request_count: 3 });

        const feedback = assertSupabaseSuccess(
          await checkPublicOperationLimit(admin, {
            operation: "feedback_submit",
            actorKey: UPGRADE.trackingKey,
            windowSeconds: 600,
            maxRequests: 5,
          }),
          "start feedback budget beside seeded counters",
        );
        const feedbackRow = Array.isArray(feedback.data)
          ? feedback.data[0]
          : feedback.data;
        expect(feedbackRow).toMatchObject({ allowed: true, request_count: 1 });

        // Old public-operation grants survive the upgrade: service_role only.
        expect(
          await runLocalSql(
            testUrl,
            `SELECT ${bits(
              ROLES.map(
                (role) =>
                  `has_function_privilege('${role}', '${LOOKUP_SIGNATURE}', 'EXECUTE')`,
              ),
            )};`,
          ),
        ).toBe("001");
        expect(await functionGrantBits(LIMIT_SIGNATURE)).toBe("001");
      },
      DB_CASE_TIMEOUT_MS,
    );
  },
);

// Issue #90: the count-only summary RPC. Exact Asia/Manila period counts live in
// feedback-summary-manila.db.test.ts; this block keeps the grant, denial, and
// window-shape checks at the RPC boundary.
const SUMMARY_SIGNATURE =
  "public.get_feedback_count_summary(uuid,timestamptz,timestamptz)";

async function readSummary(
  operatorUserId: string,
  window: Record<string, string>,
) {
  return admin.rpc("get_feedback_count_summary", {
    p_operator_user_id: operatorUserId,
    ...window,
  });
}

describe("Feedback count summary (PostgreSQL)", () => {
  it(
    "grants the summary RPC to service_role only",
    async () => {
      expect(await functionGrantBits(SUMMARY_SIGNATURE)).toBe("001");
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "denies unprovisioned and revoked operators before any aggregate",
    async () => {
      const window = {
        p_window_start: "2026-10-31T16:00:00.000Z",
        p_window_end: "2026-11-01T16:00:00.000Z",
      };
      const outsider = await createTestUser(
        admin,
        uniqueEmail("feedback-summary-outsider"),
      );
      const denied = await readSummary(outsider.user.id, window);
      expect(denied.error?.message).toContain(
        "Internal operator access required",
      );
      expect(denied.data).toBeNull();

      const operatorId = await provisionOperator("feedback-summary-revoked");
      assertSupabaseSuccess(
        await admin.rpc("change_internal_operator_access", {
          p_operator_user_id: operatorId,
          p_actor_user_id: operatorId,
          p_enabled: false,
          p_reason: REVIEW_REASON,
        }),
        "revoke summary operator",
      );
      const revoked = await readSummary(operatorId, window);
      expect(revoked.error?.message).toContain(
        "Internal operator access required",
      );
      expect(revoked.data).toBeNull();
    },
    DB_CASE_TIMEOUT_MS,
  );

  it(
    "rejects windows that are empty, inverted, or longer than 31 days",
    async () => {
      const operatorId = await provisionOperator("feedback-summary-window");
      const start = "2026-10-31T16:00:00.000Z";
      for (const end of [
        "2026-10-31T16:00:00.000Z",
        "2026-10-30T16:00:00.000Z",
        "2026-12-02T16:00:00.000Z",
      ]) {
        const result = await readSummary(operatorId, {
          p_window_start: start,
          p_window_end: end,
        });
        expect(result.error?.message).toContain(
          "FEEDBACK_SUMMARY_WINDOW_INVALID",
        );
      }
    },
    DB_CASE_TIMEOUT_MS,
  );
});
