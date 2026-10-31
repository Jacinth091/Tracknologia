import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { runLocalSql, sqlUuidLiteral } from "../helpers/local-postgres";
import {
  baseURL,
  cleanupActors,
  cleanupInternalOperator,
  createServiceClient,
  loginAndCaptureState,
  revokeInternalOperator,
  seedActor,
  seedInternalOperator,
  supabaseAnonKey,
  supabaseUrl,
  type SeedOptions,
  type TestActor,
} from "./helpers/fixtures";

const providerWithoutMapping: SeedOptions[] = [
  { providerType: "SHOP", role: "OWNER" },
  { providerType: "SHOP", role: "STAFF" },
  { providerType: "INDEPENDENT" },
];

// Temporary, actor-scoped audit failure: only this disposable operator's view
// append raises, so the mapping and Auth session stay valid. The trigger is
// removed in `finally` by the caller.
function injectAuditFault(faultName: string, operatorUserId: string): string {
  return `
    CREATE FUNCTION public.${faultName}() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
    BEGIN
      IF NEW.operator_user_id = ${sqlUuidLiteral(operatorUserId)}
        AND NEW.operation = 'INTERNAL_ACCESS_VIEW' THEN
        RAISE EXCEPTION 'injected internal audit failure for E2E';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER ${faultName} BEFORE INSERT ON public.internal_access_audit
      FOR EACH ROW EXECUTE FUNCTION public.${faultName}();
  `;
}

function removeAuditFault(faultName: string): string {
  return `
    DROP TRIGGER IF EXISTS ${faultName} ON public.internal_access_audit;
    DROP FUNCTION IF EXISTS public.${faultName}();
  `;
}

test.describe("E2E-08 Internal operator access", () => {
  test("only an enabled auth-only operator can reach the private internal area", async ({
    browser,
    request,
  }) => {
    const admin = createServiceClient();
    const operator = await seedInternalOperator(admin);
    const seededActors: TestActor[] = [];

    try {
      // 1. Anonymous access returns to login carrying the internal destination.
      const anonymousContext = await browser.newContext();
      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto("/internal");
      await expect(anonymousPage).toHaveURL(/\/login\?redirectTo=%2Finternal$/);
      await anonymousContext.close();

      // 2. The auth-only operator signs in through the real form and lands on
      //    /internal instead of the dashboard or onboarding.
      const operatorContext = await browser.newContext();
      const operatorPage = await operatorContext.newPage();
      await operatorPage.goto("/login?redirectTo=%2Finternal");
      await operatorPage.locator('input[name="email"]').fill(operator.email);
      await operatorPage
        .locator('input[name="password"]')
        .fill(operator.password);
      await operatorPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(operatorPage).toHaveURL(/\/internal$/, { timeout: 20_000 });

      const viewEvents = async () => {
        const { data, error } = await admin
          .from("internal_access_audit")
          .select(
            "event_id, operator_user_id, actor_user_id, operation, reason",
          )
          .eq("operator_user_id", operator.userId)
          .eq("operation", "INTERNAL_ACCESS_VIEW");
        if (error) {
          throw new Error(`[E2E] audit read failed: ${error.message}`);
        }
        return data ?? [];
      };
      const viewEventsBeforeVisit = await viewEvents();

      const internalResponse = await operatorPage.goto("/internal");
      expect(internalResponse?.status()).toBe(200);
      await expect(
        operatorPage
          .getByRole("heading", { name: "Internal operations" })
          .first(),
      ).toBeVisible();

      // The explicit visit must persist at least one new view event for this
      // operator. Framework navigation may duplicate work, so the count is a
      // lower bound rather than exactly one.
      const knownEventIds = new Set(
        viewEventsBeforeVisit.map((event) => event.event_id),
      );
      const newViewEvents = (await viewEvents()).filter(
        (event) => !knownEventIds.has(event.event_id),
      );
      expect(newViewEvents.length).toBeGreaterThanOrEqual(1);
      for (const event of newViewEvents) {
        expect(event).toMatchObject({
          operator_user_id: operator.userId,
          actor_user_id: operator.userId,
          operation: "INTERNAL_ACCESS_VIEW",
          reason: null,
        });
      }
      await expect(operatorPage.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      // This suite drives `next dev`, which overrides dynamic HTML responses to
      // `no-cache, must-revalidate` (with HMR `no-store`); dev does not emit
      // `private`. Accept that complete dev pair or an explicit private/
      // no-store directive. A missing header, `public`, or only one half of
      // the dev pair must still fail.
      const header = internalResponse?.headers()["cache-control"];
      const cacheControl = (header ?? "").toLowerCase();
      const directives = cacheControl
        .split(",")
        .map((directive) => directive.trim())
        .filter(Boolean);
      const allowsPrivateCaching =
        directives.includes("private") || directives.includes("no-store");
      const isDevRevalidationPair =
        directives.includes("no-cache") &&
        directives.includes("must-revalidate");

      expect(cacheControl).not.toContain("public");
      expect(allowsPrivateCaching || isDevRevalidationPair).toBe(true);

      // 2b. A real audit INSERT failure for only this operator must withhold
      //     protected content. The fault is removed in `finally`, and access
      //     must recover before the same-cookie revocation check below.
      const faultName = `e2e_audit_fault_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const viewEventsBeforeFault = await viewEvents();
      try {
        await runLocalSql(
          supabaseUrl,
          injectAuditFault(faultName, operator.userId),
        );
        await operatorPage.goto("/internal");
        await expect(
          operatorPage.getByRole("heading", {
            name: "Internal access unavailable",
          }),
        ).toBeVisible();
        await expect(
          operatorPage.getByRole("heading", { name: "Internal operations" }),
        ).toHaveCount(0);

        const knownFaultIds = new Set(
          viewEventsBeforeFault.map((event) => event.event_id),
        );
        const persistedDuringFault = (await viewEvents()).filter(
          (event) => !knownFaultIds.has(event.event_id),
        );
        expect(persistedDuringFault).toHaveLength(0);
      } finally {
        await runLocalSql(supabaseUrl, removeAuditFault(faultName));
      }

      const recovered = await operatorPage.goto("/internal");
      expect(recovered?.status()).toBe(200);
      await expect(
        operatorPage
          .getByRole("heading", { name: "Internal operations" })
          .first(),
      ).toBeVisible();

      // 3. Revocation applies to the same session on the next request.
      await revokeInternalOperator(admin, operator.userId);
      const afterRevoke = await operatorPage.goto("/internal");
      expect(afterRevoke?.status()).toBe(404);
      await expect(
        operatorPage.getByRole("heading", { name: "Internal operations" }),
      ).toHaveCount(0);
      await operatorContext.close();

      // 4. Provider-backed roles without a mapping are denied.
      for (const options of providerWithoutMapping) {
        const actor = await seedActor(admin, options);
        seededActors.push(actor);

        // A browser holding only the publishable credential cannot forge the
        // privileged admin RPC to grant itself access.
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
              p_reason: "forged e2e privilege attempt",
            },
          },
        );
        expect([401, 403]).toContain(forged.status());

        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAndCaptureState(page, actor);
        const denied = await page.goto("/internal");
        expect(denied?.status()).toBe(404);
        await expect(page.getByText("Internal operations")).toHaveCount(0);
        await context.close();
      }
    } finally {
      await cleanupInternalOperator(admin, operator.userId);
      await cleanupActors(admin, seededActors);
    }
  });

  test("the activity page admits only enabled operators", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const operator = await seedInternalOperator(admin);
    const seededActors: TestActor[] = [];

    try {
      // 1. Anonymous visitors return to login carrying the activity destination.
      const anonymousContext = await browser.newContext();
      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto("/internal/activity");
      await expect(anonymousPage).toHaveURL(
        /\/login\?redirectTo=%2Finternal%2Factivity$/,
      );
      await anonymousContext.close();

      // 2. Every Provider-backed role gets the shared internal 404.
      for (const options of providerWithoutMapping) {
        const actor = await seedActor(admin, options);
        seededActors.push(actor);

        const context = await browser.newContext();
        const page = await context.newPage();
        await loginAndCaptureState(page, actor);
        const denied = await page.goto("/internal/activity");
        expect(denied?.status()).toBe(404);
        await expect(
          page.getByRole("heading", { name: "Validation metrics" }),
        ).toHaveCount(0);
        await context.close();
      }

      // 3. The enabled operator sees the picker and a chosen period round-trips
      //    through the GET form. The form also submits empty start/end fields.
      const operatorContext = await browser.newContext();
      const operatorPage = await operatorContext.newPage();
      await operatorPage.goto("/login?redirectTo=%2Finternal%2Factivity");
      await operatorPage.locator('input[name="email"]').fill(operator.email);
      await operatorPage
        .locator('input[name="password"]')
        .fill(operator.password);
      await operatorPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(operatorPage).toHaveURL(/\/internal\/activity$/, {
        timeout: 20_000,
      });

      const heading = operatorPage.getByRole("heading", {
        name: "Validation metrics",
        exact: true,
      });
      await expect(heading).toBeVisible();
      await expect(operatorPage.locator("#metrics-period")).toHaveValue("7d");

      await operatorPage.locator("#metrics-period").selectOption("30d");
      await operatorPage
        .getByRole("button", { name: "Show period", exact: true })
        .click();
      await expect(operatorPage).toHaveURL(/[?&]period=30d(&|$)/);
      await expect(operatorPage.locator("#metrics-period")).toHaveValue("30d");
      await expect(heading).toBeVisible();

      // 4. Revocation applies to the same session on the next request.
      await revokeInternalOperator(admin, operator.userId);
      const afterRevoke = await operatorPage.goto("/internal/activity");
      expect(afterRevoke?.status()).toBe(404);
      await expect(heading).toHaveCount(0);
      await operatorContext.close();
    } finally {
      await cleanupInternalOperator(admin, operator.userId);
      await cleanupActors(admin, seededActors);
    }
  });

  test("the activity page renders no customer or feedback canary", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const canary = randomUUID().replaceAll("-", "").slice(0, 16);
    const upper = canary.toUpperCase();
    const feedbackTitle = `e2e-canary-${canary}`;
    const canaries = {
      requestName: `CANARY-REQNAME-${canary}`,
      customerName: `CANARY-NAME-${canary}`,
      customerPhone: `CANARY-PHONE-${canary}`,
      internalNotes: `CANARY-NOTES-${canary}`,
      feedbackMessage: `CANARY-FEEDBACK-${canary}`,
    };
    const seededActors: TestActor[] = [];

    const operator = await seedInternalOperator(admin);
    const actor = await seedActor(admin, {
      providerType: "SHOP",
      role: "OWNER",
    });
    seededActors.push(actor);

    try {
      // Customer and Repair data seeded as the Provider's own rows, so the
      // activity page has real records that must stay out of its output.
      const { data: request, error: requestError } = await admin
        .from("repair_requests")
        .insert({
          provider_id: actor.providerId,
          reference_code: `REQ-${upper}`,
          customer_name: canaries.requestName,
          customer_phone: canaries.customerPhone,
          device_type: "Laptop",
          reported_problem: "CANARY reported problem",
          status: "ACCEPTED",
          accepted_at: new Date().toISOString(),
          accepted_by_user_id: actor.userId,
        })
        .select("id")
        .single();
      if (requestError) {
        throw new Error(
          `[E2E fixture] request seed failed: ${requestError.message}`,
        );
      }

      const { error: repairError } = await admin.from("repairs").insert({
        provider_id: actor.providerId,
        repair_request_id: request.id,
        origin: "CUSTOMER_REQUEST",
        ticket_number: `TN-2026-${upper.slice(0, 10)}`,
        tracking_code: `TRK-${upper}${upper.slice(0, 8)}`,
        customer_name: canaries.customerName,
        customer_phone: canaries.customerPhone,
        device_type: "Laptop",
        reported_problem: "CANARY reported problem",
        internal_notes: canaries.internalNotes,
        created_by_user_id: actor.userId,
      });
      if (repairError) {
        throw new Error(
          `[E2E fixture] repair seed failed: ${repairError.message}`,
        );
      }

      const feedback = await admin.rpc("submit_feedback", {
        p_submission_nonce: randomUUID(),
        p_category: "BUG",
        p_source: "PUBLIC_TRACKING",
        p_participant_class: "PUBLIC_SELF_REPORTED_CUSTOMER",
        p_title: feedbackTitle,
        p_message: canaries.feedbackMessage,
      });
      if (feedback.error) {
        throw new Error(
          `[E2E fixture] feedback seed failed: ${feedback.error.message}`,
        );
      }
      const { data: feedbackRow, error: feedbackReadError } = await admin
        .from("feedback_submissions")
        .select("id")
        .eq("title", feedbackTitle)
        .single();
      if (feedbackReadError) {
        throw new Error(
          `[E2E fixture] feedback read failed: ${feedbackReadError.message}`,
        );
      }

      const operatorContext = await browser.newContext();
      const operatorPage = await operatorContext.newPage();
      await operatorPage.goto("/login?redirectTo=%2Finternal%2Factivity");
      await operatorPage.locator('input[name="email"]').fill(operator.email);
      await operatorPage
        .locator('input[name="password"]')
        .fill(operator.password);
      await operatorPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(operatorPage).toHaveURL(/\/internal\/activity$/, {
        timeout: 20_000,
      });

      // Listen only from here, so sign-in and redirect traffic is not captured.
      // Redirects carry no body, and Playwright cannot read one.
      const appOrigin = new URL(baseURL).origin;
      const bodies: Promise<string>[] = [];
      operatorPage.on("response", (response) => {
        const status = response.status();
        const isRedirect = status >= 300 && status < 400;
        if (!isRedirect && new URL(response.url()).origin === appOrigin) {
          bodies.push(response.text());
        }
      });

      // Default window, then a wider one that includes the seeds.
      const windows = ["/internal/activity", "/internal/activity?period=30d"];
      for (const path of windows) {
        await operatorPage.goto(path);
        await expect(
          operatorPage.getByRole("heading", {
            name: "Validation metrics",
            exact: true,
          }),
        ).toBeVisible();
        await operatorPage.waitForLoadState("networkidle");

        // The HTML includes the inline RSC payload, so page.content() covers
        // the server-rendered data as well as the markup.
        const html = await operatorPage.content();
        const responseBodies = await Promise.all(bodies);
        for (const value of Object.values(canaries)) {
          expect(html).not.toContain(value);
          for (const body of responseBodies) {
            expect(body).not.toContain(value);
          }
        }
      }

      // The same feedback canary must be visible on the authorized detail
      // page, which proves the seed is real and the absence check means
      // something.
      await operatorPage.goto(`/internal/feedback/${feedbackRow.id}`);
      await expect(
        operatorPage.getByText(canaries.feedbackMessage, { exact: true }),
      ).toBeVisible();
      await operatorContext.close();
    } finally {
      await runLocalSql(
        supabaseUrl,
        `delete from public.feedback_submissions where title = '${feedbackTitle}';`,
      );
      await cleanupInternalOperator(admin, operator.userId);
      await cleanupActors(admin, seededActors);
    }
  });

  test("the health endpoint answers anonymous probes with no cache or cookie", async ({
    request,
  }) => {
    const response = await request.get(`${baseURL}/api/health`);

    expect(response.status()).toBe(200);
    expect(await response.text()).toBe('{"status":"healthy"}');
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
});
