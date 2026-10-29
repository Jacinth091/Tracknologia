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
const OVERLAP_TEST_TIMEOUT_MS = 60_000;
const REVIEW_REASON = "feedback review integration operator";
// Must match scripts/rehearse-upgrade-fixture.sql.
const UPGRADE_ACTOR_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SUBMISSION_KEYS = [
  "category",
  "created_at",
  "id",
  "internal_notes",
  "linked_issue_url",
  "message",
  "participant_class",
  "priority",
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

async function createFeedback(overrides: Record<string, unknown> = {}) {
  const nonce = randomUUID();
  assertSupabaseSuccess(
    await admin.rpc("submit_feedback", submitInput({
      p_submission_nonce: nonce,
      ...overrides,
    })),
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

  it("keeps private tables and the submit/review RPCs away from client roles", async () => {
    const anon = createAnonClient();
    const user = await createTestUser(admin, uniqueEmail("feedback-denial"));
    const auth = await signInTestUser(user.email, user.password);

    for (const client of [anon, auth.client]) {
      const rows = await client.from("feedback_submissions").select("id");
      expect(rows.error).toMatchObject({ code: "42501" });
      const events = await client.from("feedback_review_events").select("event_id");
      expect(events.error).toMatchObject({ code: "42501" });
      expectRpcPermissionDenied(
        await client.rpc("submit_feedback", submitInput()),
      );
      expectRpcPermissionDenied(
        await client.rpc("record_feedback_review", reviewInput(randomUUID(), randomUUID(), 1, "REVIEWING")),
      );
    }

    // The privileged client has no direct write path: writes must go through
    // the narrow RPCs so the required history cannot be bypassed.
    const directInsert = await admin.from("feedback_submissions").insert({
      submission_nonce: randomUUID(),
      category: "BUG",
      source: "PUBLIC_TRACKING",
      participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      message: "Direct write attempt",
    });
    expect(directInsert.error).toMatchObject({ code: "42501" });
  });

  it("grants exactly the intended roles on each overload and table", async () => {
    const functionPrivileges = (signature: string) =>
      runLocalSql(
        testUrl,
        `SELECT has_function_privilege('anon', '${signature}', 'EXECUTE') || '|' || has_function_privilege('authenticated', '${signature}', 'EXECUTE') || '|' || has_function_privilege('service_role', '${signature}', 'EXECUTE');`,
      );

    expect(
      await functionPrivileges(
        "public.submit_feedback(uuid,text,text,text,text,text)",
      ),
    ).toBe("f|f|t");
    expect(
      await functionPrivileges(
        "public.record_feedback_review(uuid,uuid,integer,text,text,text,text,text)",
      ),
    ).toBe("f|f|t");
    expect(
      await functionPrivileges(
        "public.check_public_operation_rate_limit(text,text,integer,integer,integer)",
      ),
    ).toBe("f|f|t");

    expect(
      await runLocalSql(
        testUrl,
        `SELECT has_table_privilege('service_role', 'public.feedback_submissions', 'SELECT') || '|' || has_table_privilege('service_role', 'public.feedback_submissions', 'INSERT') || '|' || has_table_privilege('authenticated', 'public.feedback_submissions', 'SELECT') || '|' || has_table_privilege('anon', 'public.feedback_review_events', 'SELECT') || '|' || has_table_privilege('service_role', 'public.feedback_review_events', 'UPDATE');`,
      ),
    ).toBe("t|f|f|f|f");
  });

  it("accepts every valid category, source and participant-class combination once with server defaults", async () => {
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
          await admin.rpc("submit_feedback", submitInput({
            p_submission_nonce: nonce,
            p_category: category,
            p_source: source,
            p_participant_class: participantClass,
          })),
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
          reviewed_at: null,
          reviewed_by: null,
        });
        expect(Object.keys(row).sort()).toEqual([...SUBMISSION_KEYS].sort());
      }
    }
  });

  it.each([
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
  ])("rejects %s without creating a row", async (_name, overrides) => {
    const nonce = randomUUID();
    const result = await admin.rpc(
      "submit_feedback",
      submitInput({ p_submission_nonce: nonce, ...overrides }),
    );
    expect(result.error).not.toBeNull();
    expect(await readByNonce(nonce)).toEqual([]);
  });

  it("rejects an invalid row even from a privileged database session", async () => {
    await expect(
      runLocalSql(
        testUrl,
        `INSERT INTO public.feedback_submissions (submission_nonce, category, source, participant_class, message) VALUES ('${randomUUID()}', 'BUG', 'PUBLIC_REQUEST', 'SHOP_OWNER', 'direct');`,
      ),
    ).rejects.toThrow(/feedback_submissions_source_class_pair_check/);
  });

  it("counts PostgreSQL characters and trims only ASCII edge whitespace", async () => {
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
  });

  it("makes a same-nonce retry a no-op that never changes or discloses the original", async () => {
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
  });

  it("serializes overlapping same-nonce submissions into one durable row", async () => {
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
      const secondOutcome = second.query(submit("Concurrent retry")).then(
        (output) => {
          secondSettled = true;
          return output;
        },
      );
      secondOutcome.catch(() => undefined);

      await waitUntilBlockedBy(control, secondPid, holderPid);
      expect(secondSettled).toBe(false);

      await holder.query("COMMIT;");
      expect(await secondOutcome).toBe("ACCEPTED");

      const rows = await readByNonce(nonce);
      expect(rows).toHaveLength(1);
      expect(rows[0].message).toBe("Concurrent original");
    });
  }, OVERLAP_TEST_TIMEOUT_MS);

  it("applies a versioned review atomically and appends exactly one history event", async () => {
    const operatorId = await provisionOperator("feedback-review-happy");
    const feedback = await createFeedback();

    const version = assertSupabaseSuccess(
      await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 1, "REVIEWING", {
        p_target_priority: "HIGH",
        p_internal_notes: "Internal triage note",
        p_linked_issue_url: "https://github.com/Jacinth091/Tracknologia/issues/89",
      })),
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
  });

  it("rejects a stale version, an illegal transition and an unexplained reopen without writing", async () => {
    const operatorId = await provisionOperator("feedback-review-guards");
    const feedback = await createFeedback();

    assertSupabaseSuccess(
      await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 1, "REVIEWING")),
      "first review",
    );

    const stale = await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 1, "REVIEWING"));
    expect(stale.error?.message).toContain("FEEDBACK_VERSION_CONFLICT");

    const illegal = await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 2, "NEW"));
    expect(illegal.error?.message).toContain("FEEDBACK_INVALID_TRANSITION");

    assertSupabaseSuccess(
      await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 2, "RESOLVED")),
      "resolve feedback",
    );

    const unexplained = await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 3, "REVIEWING"));
    expect(unexplained.error?.message).toContain("FEEDBACK_REASON_REQUIRED");

    assertSupabaseSuccess(
      await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 3, "REVIEWING", {
        p_reason: "New evidence arrived",
      })),
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
  });

  it("refuses a review from a revoked operator and leaves the row and history unchanged", async () => {
    const operatorId = await provisionOperator("feedback-review-revoked");
    const feedback = await createFeedback();
    assertSupabaseSuccess(
      await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 1, "REVIEWING")),
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

    const denied = await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 2, "PLANNED"));
    expect(denied.error?.message).toContain("Internal operator access required");

    const [current] = await readByNonce(feedback.submission_nonce);
    expect(current).toMatchObject({ status: "REVIEWING", row_version: 2 });
    expect(await readHistory(feedback.id)).toHaveLength(1);
  });

  it("rolls back the whole review when its history event cannot be written", async () => {
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
        captureReviewSql(reviewCallSql(feedback.id, operatorId, 1, "REVIEWING")),
        `SELECT (SELECT row_version FROM public.feedback_submissions WHERE id = ${sqlUuidLiteral(feedback.id)});`,
        "ROLLBACK;",
      ].join("\n");
      return holder.query(sql);
    });

    const [capturedOutcome, versionAfterFault] = outcome.split("\n");
    expect(capturedOutcome).toBe("FAULT_INJECTED");
    expect(versionAfterFault).toBe("1");

    const [current] = await readByNonce(feedback.submission_nonce);
    expect(current).toMatchObject({ status: "NEW", row_version: 1, reviewed_by: null });
    expect(await readHistory(feedback.id)).toEqual([]);
  });

  it("refuses to delete a reviewer whose identity is referenced by review history", async () => {
    const operatorId = await provisionOperator("feedback-review-restrict");
    const feedback = await createFeedback();
    assertSupabaseSuccess(
      await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 1, "REVIEWING")),
      "review before deletion attempt",
    );

    const deleted = await admin.auth.admin.deleteUser(operatorId);
    expect(deleted.error).not.toBeNull();

    const stillPresent = assertSupabaseSuccess(
      await admin.from("internal_operators").select("user_id").eq("user_id", operatorId),
      "read reviewer mapping after refused deletion",
    );
    expect(stillPresent.data).toHaveLength(1);
  });

  it("serializes two reviewers on the same version: one commits, the other conflicts", async () => {
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
        .query(captureReviewSql(reviewCallSql(feedback.id, secondOperator, 1, "REVIEWING")))
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
    expect(current).toMatchObject({ status: "REVIEWING", row_version: 2, reviewed_by: firstOperator });
    expect(await readHistory(feedback.id)).toHaveLength(1);
  }, OVERLAP_TEST_TIMEOUT_MS);

  it("orders an in-flight review before a revocation, then denies later reviews", async () => {
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

    const denied = await admin.rpc("record_feedback_review", reviewInput(feedback.id, operatorId, 2, "PLANNED"));
    expect(denied.error?.message).toContain("Internal operator access required");
    expect(await readHistory(feedback.id)).toHaveLength(1);
  }, OVERLAP_TEST_TIMEOUT_MS);

  it("enforces the exact feedback budget under overlap and keeps other operations independent", async () => {
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
      const successful = assertSupabaseSuccess(attempt, "consume feedback budget");
      return Array.isArray(successful.data) ? successful.data[0] : successful.data;
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
    const trackingRow = Array.isArray(tracking.data) ? tracking.data[0] : tracking.data;
    expect(trackingRow).toMatchObject({ allowed: true, request_count: 1 });

    const unknown = await admin.rpc("check_public_operation_rate_limit", {
      p_operation: "feedback_submit_unknown",
      p_actor_key: actorKey,
      p_window_seconds: 600,
      p_max_requests: 5,
      p_cleanup_limit: 0,
    });
    expect(unknown.error?.message).toContain("INVALID_RATE_LIMIT_OPERATION");
  });
});

// Runs only after scripts/rehearse-pending-migrations.sh seeded old-state data
// on the base history and applied the pending migrations on top of it.
describe.runIf(process.env.REHEARSAL_UPGRADE_FIXTURE === "1")(
  "pending-only upgrade preserves old-state data",
  () => {
    it("keeps the seeded counter and Provider, and keeps old and new budgets independent", async () => {
      const counter = assertSupabaseSuccess(
        await admin
          .from("public_operation_rate_limits")
          .select("request_count")
          .eq("operation", "tracking_lookup")
          .eq("actor_key", UPGRADE_ACTOR_KEY)
          .single(),
        "read seeded tracking counter after upgrade",
      );
      expect(counter.data).toEqual({ request_count: 3 });

      const oldOperation = assertSupabaseSuccess(
        await checkPublicOperationLimit(admin, {
          operation: "tracking_lookup",
          actorKey: UPGRADE_ACTOR_KEY,
          windowSeconds: 60,
          maxRequests: 30,
        }),
        "continue seeded tracking counter after upgrade",
      );
      const oldRow = Array.isArray(oldOperation.data) ? oldOperation.data[0] : oldOperation.data;
      expect(oldRow).toMatchObject({ allowed: true, request_count: 4 });

      const newOperation = assertSupabaseSuccess(
        await checkPublicOperationLimit(admin, {
          operation: "feedback_submit",
          actorKey: UPGRADE_ACTOR_KEY,
          windowSeconds: 600,
          maxRequests: 5,
        }),
        "start feedback budget beside seeded counter",
      );
      const newRow = Array.isArray(newOperation.data) ? newOperation.data[0] : newOperation.data;
      expect(newRow).toMatchObject({ allowed: true, request_count: 1 });

      const provider = assertSupabaseSuccess(
        await admin
          .from("providers")
          .select("display_name")
          .eq("slug", "rehearsal-upgrade-provider")
          .single(),
        "read seeded Provider after upgrade",
      );
      expect(provider.data).toEqual({ display_name: "Rehearsal Upgrade Provider" });
    });
  },
);
