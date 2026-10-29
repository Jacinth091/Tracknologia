import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { runLocalSql, sqlUuidLiteral } from "../helpers/local-postgres";
import {
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
});
