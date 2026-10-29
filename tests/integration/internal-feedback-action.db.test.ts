import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// Mock boundary, stated plainly: the operator guard, the Supabase client
// factory, and the cache revalidation are replaced. The Server Action, feature
// schema, review command, and persistence run as in production, and every
// assertion reads PostgreSQL directly.
const shared = vi.hoisted(() => ({
  client: undefined as unknown,
  operatorId: "",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
    throw new Error("provider context is not used by the review action");
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkClientRateLimit: async () => {
    throw new Error("the abuse limiter is not used by the review action");
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createPublicOperationClient: async () => {
    throw new Error("the public client is not used by the review action");
  },
}));

import { recordFeedbackReviewAction } from "@/app/(internal)/internal/feedback/actions";

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
const FOLLOW_UP = "Waiting on a reproduction";
const LINK = "https://github.com/Jacinth091/Tracknologia/issues/12";

async function provisionOperator(prefix: string): Promise<string> {
  const created = await createTestUser(admin, uniqueEmail(prefix));
  assertSupabaseSuccess(
    await admin.rpc("change_internal_operator_access", {
      p_operator_user_id: created.user.id,
      p_actor_user_id: created.user.id,
      p_enabled: true,
      p_reason: "feedback action integration operator",
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
    "submit action fixture",
  );
  const { id } = assertSupabaseSuccess(
    await admin
      .from("feedback_submissions")
      .select("id")
      .eq("submission_nonce", nonce)
      .single(),
    "read action fixture id",
  ).data as { id: string };
  return id;
}

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
  if (row === null || history === null) {
    throw new Error("stored feedback read returned no data");
  }
  return { row, history };
}

// The form always submits every review field; these builders mirror that.
function reviewForm(
  id: string,
  expectedRowVersion: number,
  fields: {
    status: string;
    internalNotes?: string;
    linkedIssueUrl?: string;
  },
): FormData {
  const form = new FormData();
  form.set("feedbackId", id);
  form.set("expectedRowVersion", String(expectedRowVersion));
  form.set("status", fields.status);
  form.set("priority", "NORMAL");
  if (fields.internalNotes !== undefined) {
    form.set("internalNotes", fields.internalNotes);
  }
  if (fields.linkedIssueUrl !== undefined) {
    form.set("linkedIssueUrl", fields.linkedIssueUrl);
  }
  return form;
}

describe("Feedback review action keeps stored fields (PostgreSQL)", () => {
  it(
    "rejects omitted notes or link keys, clears on explicit blanks once, and saves a complete review",
    async () => {
      shared.operatorId = await provisionOperator("feedback-action");
      const id = await submitFixture();

      const populated = await recordFeedbackReviewAction(
        null,
        reviewForm(id, 1, {
          status: "REVIEWING",
          internalNotes: NOTES,
          linkedIssueUrl: LINK,
        }),
      );
      expect(populated).toEqual({
        success: "Review saved",
        appliedRowVersion: 2,
      });
      const before = await readStored(id);
      expect(before.row).toMatchObject({
        internal_notes: NOTES,
        linked_issue_url: LINK,
        row_version: 2,
      });
      expect(before.history).toHaveLength(1);

      // Omitted keys are rejected by the feature schema before persistence, so
      // the stored notes, link, version, and history are untouched.
      const notesOmitted = await recordFeedbackReviewAction(
        null,
        reviewForm(id, 2, { status: "PLANNED", linkedIssueUrl: LINK }),
      );
      expect(notesOmitted).toEqual({
        error: "Internal notes is required; send null to clear it",
        appliedRowVersion: 2,
      });
      const linkOmitted = await recordFeedbackReviewAction(
        null,
        reviewForm(id, 2, { status: "PLANNED", internalNotes: NOTES }),
      );
      expect(linkOmitted).toEqual({
        error: "Linked issue is required; send null to clear it",
        appliedRowVersion: 2,
      });
      expect(await readStored(id)).toEqual(before);

      // Submitted blanks clear the stored text with exactly one new version
      // and one history event.
      const cleared = await recordFeedbackReviewAction(
        null,
        reviewForm(id, 2, {
          status: "PLANNED",
          internalNotes: "",
          linkedIssueUrl: "",
        }),
      );
      expect(cleared).toEqual({ success: "Review saved", appliedRowVersion: 3 });
      const afterClear = await readStored(id);
      expect(afterClear.row).toEqual({
        message: MESSAGE,
        status: "PLANNED",
        priority: "NORMAL",
        internal_notes: null,
        linked_issue_url: null,
        row_version: 3,
      });
      expect(afterClear.history).toHaveLength(2);

      // A complete decision on the new version writes everything in one step.
      const complete = await recordFeedbackReviewAction(
        null,
        reviewForm(id, 3, {
          status: "PLANNED",
          internalNotes: FOLLOW_UP,
          linkedIssueUrl: LINK,
        }),
      );
      expect(complete).toEqual({ success: "Review saved", appliedRowVersion: 4 });
      const finished = await readStored(id);
      expect(finished.row).toMatchObject({
        internal_notes: FOLLOW_UP,
        linked_issue_url: LINK,
        row_version: 4,
      });
      expect(finished.history).toHaveLength(3);
    },
    DB_CASE_TIMEOUT_MS,
  );
});
