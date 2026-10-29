import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mock boundary, stated plainly: the operator guard and the Supabase client
// factory are replaced. The guard returns ALLOWED for a real, enabled operator
// provisioned below. The auth, limiter, and public-client modules that the
// review path imports are replaced by stubs that this flow never calls. The
// review feature, its persistence, and the real review function run as in
// production, and every assertion reads the database directly.
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

vi.mock("@/features/auth", () => ({
  AuthError: class extends Error {},
  requireProviderContext: async () => {
    throw new Error("provider context is not used by the review flow");
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkClientRateLimit: async () => {
    throw new Error("the abuse limiter is not used by the review flow");
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: async () => {
    throw new Error("the public client is not used by the review flow");
  },
}));

import { recordFeedbackReview } from "@/features/feedback/commands";
import { FeedbackError } from "@/features/feedback/types";

import {
  assertSupabaseSuccess,
  createAdminClient,
  createTestUser,
  requireDbConfig,
  uniqueEmail,
} from "./helpers/supabase-test-context";

requireDbConfig();

const admin = createAdminClient();
shared.client = admin;

const DB_CASE_TIMEOUT_MS = 90_000;
const MESSAGE = "The tracking page shows an error.";
const NOTES = "Escalated to developer";
const LINK = "https://github.com/Jacinth091/Tracknologia/issues/12";

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: "feedback review flow integration operator",
    }),
    `provision ${prefix} operator`,
  );
  return created.user.id;
}

async function submitFixture(): Promise<string> {
  const nonce = randomUUID();
  assertSupabaseSuccess(
    await admin.rpc("submit_feedback", {
      p_submission_nonce: nonce,
      p_category: "BUG",
      p_source: "PUBLIC_TRACKING",
      p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
      p_title: null,
      p_message: MESSAGE,
    }),
    "submit review flow fixture",
  );
  const { id } = assertSupabaseSuccess(
    await admin
      .from("feedback_submissions")
      .select("id")
      .eq("submission_nonce", nonce)
      .single(),
    "read review flow fixture id",
  ).data as { id: string };
  return id;
}

// Reads the stored review fields and the complete history straight from the
// database, so the assertions do not depend on any mocked read.
async function readStored(id: string) {
  const row = assertSupabaseSuccess(
    await admin
      .from("feedback_submissions")
      .select(
        "message, status, priority, internal_notes, linked_issue_url, row_version",
      )
      .eq("id", id)
      .single(),
    "read stored feedback row",
  ).data;
  const history = assertSupabaseSuccess(
    await admin
      .from("feedback_review_events")
      .select("from_status, to_status, row_version, reason")
      .eq("feedback_id", id)
      .order("row_version", { ascending: true }),
    "read stored feedback history",
  ).data;
  return { row, history };
}

async function rejectionOf(promise: Promise<unknown>): Promise<FeedbackError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FeedbackError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the review to be rejected");
}

describe("Feedback review keeps stored fields (PostgreSQL)", () => {
  it(
    "rejects an omitted notes or link key without changing the row or history, and clears on explicit null",
    async () => {
      shared.operatorId = await provisionOperator("feedback-review-flow");
      const id = await submitFixture();

      const populated = await recordFeedbackReview(
        id,
        {
          status: "REVIEWING",
          priority: "NORMAL",
          internalNotes: NOTES,
          linkedIssueUrl: LINK,
        },
        1,
      );
      expect(populated).toEqual({
        status: "REVIEWING",
        priority: "NORMAL",
        rowVersion: 2,
      });
      const before = await readStored(id);
      expect(before.row).toMatchObject({
        internal_notes: NOTES,
        linked_issue_url: LINK,
        row_version: 2,
      });
      expect(before.history).toHaveLength(1);

      // A status-only decision is an incomplete full-replacement decision.
      const statusOnly = await rejectionOf(
        recordFeedbackReview(id, { status: "PLANNED", priority: "NORMAL" }, 2),
      );
      expect(statusOnly.code).toBe("INVALID_INPUT");
      // Each key is required on its own, so omitting only one also fails.
      const notesOmitted = await rejectionOf(
        recordFeedbackReview(
          id,
          { status: "PLANNED", priority: "NORMAL", linkedIssueUrl: LINK },
          2,
        ),
      );
      expect(notesOmitted.code).toBe("INVALID_INPUT");
      const linkOmitted = await rejectionOf(
        recordFeedbackReview(
          id,
          { status: "PLANNED", priority: "NORMAL", internalNotes: NOTES },
          2,
        ),
      );
      expect(linkOmitted.code).toBe("INVALID_INPUT");

      // Rejected attempts left the row, the version, and history untouched.
      expect(await readStored(id)).toEqual(before);

      // Explicit nulls clear the stored values, with exactly one version and
      // one history event added.
      const cleared = await recordFeedbackReview(
        id,
        {
          status: "PLANNED",
          priority: "NORMAL",
          internalNotes: null,
          linkedIssueUrl: null,
        },
        2,
      );
      expect(cleared).toEqual({
        status: "PLANNED",
        priority: "NORMAL",
        rowVersion: 3,
      });
      const after = await readStored(id);
      expect(after.row).toEqual({
        message: MESSAGE,
        status: "PLANNED",
        priority: "NORMAL",
        internal_notes: null,
        linked_issue_url: null,
        row_version: 3,
      });
      expect(after.history).toHaveLength(2);
      expect(after.history[1]).toEqual({
        from_status: "REVIEWING",
        to_status: "PLANNED",
        row_version: 3,
        reason: null,
      });
    },
    DB_CASE_TIMEOUT_MS,
  );
});
