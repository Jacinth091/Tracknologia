import { expect, test } from "@playwright/test";
import {
  cleanupActors,
  createServiceClient,
  seedActor,
  type TestActor,
} from "./helpers/fixtures";
import { findRecoveryLink, purgeRecoveryMailbox } from "./helpers/mail";

const NEW_PASSWORD = "RecoveredPass#124";
const NEUTRAL_REQUEST_COPY =
  "If an account is registered with this email, a password reset email is on its way.";

test.describe("E2E-07 Password recovery (#126)", () => {
  test.setTimeout(120_000);

  let admin: ReturnType<typeof createServiceClient>;
  let actor: TestActor;

  test.beforeAll(async () => {
    admin = createServiceClient();
    actor = await seedActor(admin, { providerType: "SHOP" });
    await purgeRecoveryMailbox(actor.email);
  });

  test.afterAll(async () => {
    try {
      await cleanupActors(admin, actor ? [actor] : []);
    } catch {
      // Cleanup must never mask the scenario's own result.
    }
  });

  test("requests a link, exchanges it, resets the password, and rejects stale links", async ({
    browser,
    page,
  }) => {
    // 1. Recovery is discoverable from the sign-in page and the request is
    //    answered neutrally (no account-existence leak).
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.locator('input[name="email"]').fill(actor.email);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(
      page.getByText(NEUTRAL_REQUEST_COPY, { exact: true }),
    ).toBeVisible();

    // 2. The recovery email arrives at the account's sign-in email and
    //    carries the real callback link.
    const recoveryHref = await findRecoveryLink(actor.email);

    // 3. Opening the link in a fresh browser exchanges the code and reaches
    //    the reset form with the recovery marker (regression for the proxy
    //    bouncing authenticated visitors away from /reset-password).
    await page.goto(recoveryHref);
    await expect(page).toHaveURL(/\/reset-password\?flow=recovery/);
    await expect(
      page.getByRole("heading", { name: "Set New Password" }),
    ).toBeVisible();

    // 4. The visitor completes the reset.
    await page.locator('input[name="password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirmPassword"]').fill(NEW_PASSWORD);
    await page
      .getByRole("button", { name: "Update Password & Go to Dashboard" })
      .click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // 5. A reused (already-exchanged) link cannot reach the form again: an
    //    unauthenticated stale visitor gets the login page with a useful
    //    message instead of a silent dead end.
    const stalePage = await browser.newPage();
    try {
      await stalePage.goto(recoveryHref);
      await expect(stalePage).toHaveURL(/\/login\?error=auth_callback_failed/);
      await expect(
        stalePage.getByText("That link could not be verified"),
      ).toBeVisible();
    } finally {
      await stalePage.close();
    }

    // 6. The old password is rejected and the new one signs in.
    const verifyPage = await browser.newPage();
    try {
      await verifyPage.goto("/login");
      await verifyPage.locator('input[name="email"]').fill(actor.email);
      await verifyPage.locator('input[name="password"]').fill(actor.password);
      await verifyPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(verifyPage.getByText("Could not sign in")).toBeVisible();

      await verifyPage.locator('input[name="password"]').fill(NEW_PASSWORD);
      await verifyPage
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(verifyPage).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    } finally {
      await verifyPage.close();
    }
  });

  test("Account & security separates the sign-in email from the customer contact email", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(actor.email);
    await page.locator('input[name="password"]').fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/dashboard/settings");

    // Account & security shows the real sign-in email read-only.
    await page.getByRole("tab", { name: "Account" }).click();
    const signInEmailInput = page.locator("#account-signin-email");
    await expect(signInEmailInput).toBeDisabled();
    await expect(signInEmailInput).toHaveValue(actor.email);
    await expect(
      page.getByText(/Password recovery emails are sent here/i).first(),
    ).toBeVisible();

    // The business contact email is clearly a customer-facing field, and
    // editing it never changes sign-in credentials or recovery delivery.
    await page.getByRole("tab", { name: "Business" }).click();
    const contactEmail = `customer-contact.${Date.now()}@example.test`;
    await page.getByLabel("Customer Contact Email").fill(contactEmail);
    await page.getByRole("button", { name: "Save Provider Profile" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.getByRole("tab", { name: "Account" }).click();
    await expect(page.locator("#account-signin-email")).toHaveValue(
      actor.email,
    );

    // Recovery still targets the sign-in email: a signed-in visit to the
    // recovery site stays reachable from settings.
    await page.getByRole("link", { name: "Open password recovery" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);

    // Sign-in still works with the recovery-set password.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(actor.email);
    await page.locator('input[name="password"]').fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("an unauthenticated visit without recovery credentials cannot open the form", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: "Recovery link required" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Request a new reset email" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set New Password" }),
    ).toHaveCount(0);
  });
});
