import {
  expect,
  test,
  type Request as PlaywrightRequest,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupActors,
  cleanupInternalOperator,
  createServiceClient,
  loginAndCaptureState,
  replayActionRequest,
  revokeInternalOperator,
  seedActor,
  seedInternalOperator,
  supabaseAnonKey,
  supabaseUrl,
  type CapturedActionRequest,
  type SeedOptions,
  type TestActor,
} from "./helpers/fixtures";

// Disposable feedback rows have no Customer/Provider identity linkage, and
// their only write paths are the append-only RPCs (service role gets SELECT
// only), so between runs they stay in the disposable local database until this
// spec's trusted-SQL cleanup removes the run's rows. Every assertion scopes
// itself with a per-run marker instead of counting rows.

type FeedbackAdmin = ReturnType<typeof createServiceClient>;

function submitFeedbackFixture(
  admin: FeedbackAdmin,
  runId: string,
  suffix: string,
  category: "BUG" | "GENERAL",
) {
  return admin.rpc("submit_feedback", {
    p_submission_nonce: randomUUID(),
    p_category: category,
    p_source: "PUBLIC_TRACKING",
    p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
    p_title: `e2e-fb-run-${runId}-${category}`,
    p_message: `e2e-message-${runId}-${suffix}`,
  });
}

async function feedbackRowByTitle(admin: FeedbackAdmin, title: string) {
  const { data, error } = await admin
    .from("feedback_submissions")
    .select("id, status, row_version, message")
    .eq("title", title)
    .maybeSingle();
  if (error) {
    throw new Error(`[E2E fixture] feedback row read failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(`[E2E fixture] feedback row ${title} not found`);
  }
  return data;
}

/**
 * Removes the run's review events and then the submissions themselves through
 * the trusted local SQL connection (the destructive paths exist only in the
 * RPCs, not as direct service-role writes). Review events reference the
 * operator with ON DELETE RESTRICT, so the events go first.
 */
async function cleanupRunRows(admin: FeedbackAdmin, runId: string) {
  const { runLocalSql } = await import("../helpers/local-postgres");
  const marker = `e2e-fb-run-${runId}-%`;
  await runLocalSql(
    supabaseUrl,
    `
    delete from public.feedback_review_events e
      using public.feedback_submissions s
      where e.feedback_id = s.id and s.title like '${marker}';
    delete from public.feedback_submissions where title like '${marker}';
    `,
  );
  void admin;
}

test.describe("E2E-09 Internal feedback inbox", () => {
  test("providers cannot load the inbox or forge operator access", async ({
    browser,
    request,
  }) => {
    const admin = createServiceClient();
    const providerCases: SeedOptions[] = [
      { providerType: "SHOP", role: "STAFF" },
      { providerType: "INDEPENDENT" },
    ];
    const seededActors: TestActor[] = [];

    try {
      // Anonymous users are sent to login by the internal layout guard.
      const anonymousContext = await browser.newContext();
      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto("/internal/feedback");
      await expect(anonymousPage).toHaveURL(/\/login\?redirectTo=/);
      await anonymousContext.close();

      // Providers are denied with the shared internal 404 on the inbox and a
      // detail route alike.
      for (const options of providerCases) {
        const actor = await seedActor(admin, options);
        seededActors.push(actor);

        // A Provider browser holding only the publishable credential cannot
        // grant itself operator access through the privileged adapter RPC.
        const forged = await request.post(
          `${supabaseUrl}/rest/v1/rpc/change_internal_operator_access`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
            data: {
              p_operator_user_id: actor.userId,
              p_actor_user_id: actor.userId,
              p_enabled: true,
              p_reason: "forged e2e operator privilege attempt",
            },
          },
        );
        expect([401, 403]).toContain(forged.status());

        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAndCaptureState(page, actor);
        const inbox = await page.goto("/internal/feedback");
        expect(inbox?.status()).toBe(404);
        const detail = await page.goto(`/internal/feedback/${randomUUID()}`);
        expect(detail?.status()).toBe(404);
        await context.close();
      }
    } finally {
      await cleanupActors(admin, seededActors);
    }
  });

  test("an operator triages through the real UI with history, stale refusal and append-only guarantees", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const runId = randomUUID().slice(0, 8);
    const rowATitle = `e2e-fb-run-${runId}-BUG`;
    const rowBTitle = `e2e-fb-run-${runId}-GENERAL`;
    const participantMessage = `e2e-message-${runId}-regular`;

    const operator = await seedInternalOperator(admin);
    const submitA = await submitFeedbackFixture(admin, runId, "regular", "BUG");
    const submitB = await submitFeedbackFixture(
      admin,
      runId,
      "regular",
      "GENERAL",
    );
    if (submitA.error || submitB.error) {
      throw new Error(
        `[E2E fixture] feedback seeding failed: ${submitA.error?.message ?? ""} ${submitB.error?.message ?? ""}`,
      );
    }

    const operatorContext = await browser.newContext();
    const operatorPage = await operatorContext.newPage();

    try {
      await operatorPage.goto("/login?redirectTo=%2Finternal%2Ffeedback");
      await operatorPage.locator('input[name="email"]').fill(operator.email);
      await operatorPage
        .locator('input[name="password"]')
        .fill(operator.password);
      await operatorPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(operatorPage).toHaveURL(/\/internal\/feedback$/, {
        timeout: 20_000,
      });

      // The list shows the run's unique markers; the raw participant message
      // never appears in the previews.
      await expect(
        operatorPage.getByRole("heading", { name: "Feedback Inbox" }),
      ).toBeVisible();
      await expect(operatorPage.getByText(rowATitle)).toBeVisible();
      await expect(operatorPage.getByText(participantMessage)).toHaveCount(0);

      // The category filter narrows the list through the real GET form.
      await operatorPage.locator("#filter-category").selectOption("BUG");
      await operatorPage.getByRole("button", { name: "Apply filters" }).click();
      await expect(
        operatorPage.getByRole("heading", { name: "Feedback Inbox" }),
      ).toBeVisible();
      await expect(operatorPage.getByText(rowATitle)).toBeVisible();
      await expect(operatorPage.getByText(rowBTitle)).toHaveCount(0);

      // Open the detail through the real list link.
      await operatorPage
        .getByRole("link", { name: `Open feedback: ${rowATitle}` })
        .click();
      await expect(
        operatorPage.getByRole("heading", { name: "Feedback review" }),
      ).toBeVisible();
      await expect(
        operatorPage.getByText(participantMessage, { exact: true }),
      ).toBeVisible();

      // Triage through the real form: NEW -> REVIEWING. Capture the exact
      // on-the-wire action request so its byte-for-byte replay can be refused
      // once the row's version has moved past it.
      let capturedFirstSave: CapturedActionRequest | null = null;
      const captureTriage = (request: PlaywrightRequest) => {
        if (
          capturedFirstSave ||
          !request.headers()["next-action"] ||
          !request.postData()
        ) {
          return;
        }
        capturedFirstSave = {
          url: request.url(),
          headers: request.headers(),
          postData: request.postData() as string,
        };
      };

      await operatorPage
        .getByLabel("Internal notes")
        .fill("operator triage pass");
      operatorPage.on("request", captureTriage);
      await operatorPage.locator("#triage-status").selectOption("REVIEWING");
      await operatorPage.getByRole("button", { name: "Save review" }).click();
      await expect(operatorPage.getByText("Review saved")).toBeVisible({
        timeout: 15_000,
      });
      operatorPage.off("request", captureTriage);
      if (!capturedFirstSave) {
        throw new Error("[E2E fixture] triage action was not captured");
      }

      // The durable history holds the transition.
      await expect(operatorPage.getByText("New → Reviewing")).toBeVisible();

      // Durable state moved on, and the participant message is unchanged.
      const seeded = await feedbackRowByTitle(admin, rowATitle);
      expect(seeded.status).toBe("REVIEWING");
      expect(seeded.message).toBe(participantMessage);

      // A stale replay of the first save (its row version is behind the
      // committed one) must be refused without silently overwriting state.
      const current = capturedFirstSave as CapturedActionRequest;
      const replayResult = await replayActionRequest(operatorPage, current);
      expect(replayResult.status).toBeLessThan(500);
      expect(replayResult.body).toContain("changed since it was opened");

      const afterStale = await feedbackRowByTitle(admin, rowATitle);
      expect(afterStale.row_version).toBe(seeded.row_version);
      expect(afterStale.status).toBe("REVIEWING");

      // Append-only guarantee closing the loop: with review history present,
      // the operator identity cannot be deleted (that refusal is by design,
      // unlike the grant/revoke-only operators of the O1 spec).
      const refused = await admin.auth.admin.deleteUser(operator.userId);
      expect(refused.error).not.toBeNull();
    } finally {
      await operatorContext.close();
      await revokeInternalOperator(admin, operator.userId);
      await cleanupRunRows(admin, runId);
      await cleanupInternalOperator(admin, operator.userId);
    }
  });
});
