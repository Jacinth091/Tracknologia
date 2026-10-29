import { expect, test } from "@playwright/test";
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
      await expect(anonymousPage).toHaveURL(
        /\/login\?redirectTo=%2Finternal$/,
      );
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

      const internalResponse = await operatorPage.goto("/internal");
      expect(internalResponse?.status()).toBe(200);
      await expect(
        operatorPage
          .getByRole("heading", { name: "Internal operations" })
          .first(),
      ).toBeVisible();
      await expect(operatorPage.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex/,
      );
      expect(internalResponse?.headers()["cache-control"] ?? "").not.toContain(
        "public",
      );

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
