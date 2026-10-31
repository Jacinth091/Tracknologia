import { expect, test, type Page } from "@playwright/test";
import {
  cleanupActors,
  createServiceClient,
  seedActor,
  type TestActor,
} from "./helpers/fixtures";
import { findRecoveryLink, purgeRecoveryMailbox } from "./helpers/mail";

const NEW_PASSWORD = "RecoveredPass#124";
// The full neutral copy the request action returns (both sentences).
const NEUTRAL_REQUEST_COPY =
  "If an account is registered with this email, a password reset email is on its way. If you don't receive one shortly, try again later.";

/** The same mask the reset page shows: first letter, bullets, full domain. */
function maskedEmail(email: string): string {
  return `${email.charAt(0)}•••${email.slice(email.indexOf("@"))}`;
}

async function signInThroughForm(
  page: Page,
  actor: Pick<TestActor, "email" | "password">,
): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(actor.email);
  await page.locator('input[name="password"]').fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

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

  test("real mail resets the password once; reuse and the old password are refused", async ({
    browser,
    page,
  }) => {
    // 1. Recovery is discoverable from the sign-in page and the request is
    //    answered with the full neutral copy (no account-existence leak).
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.locator('input[name="email"]').fill(actor.email);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(page.getByText(NEUTRAL_REQUEST_COPY)).toBeVisible();

    // 2. The recovery email arrives at the account's sign-in email and
    //    carries the real callback link.
    const recoveryHref = await findRecoveryLink(actor.email);

    // 3. Opening the link in a fresh browser exchanges the code and reaches
    //    the reset form for a recent recovery request.
    await page.goto(recoveryHref);
    await expect(page).toHaveURL(/\/reset-password\?flow=recovery/);
    await expect(
      page.getByRole("heading", { name: "Set New Password" }),
    ).toBeVisible();
    await expect(
      page.getByText(`Setting a new password for ${maskedEmail(actor.email)}`),
    ).toBeVisible();

    // 4. The visitor completes the reset.
    await page.locator('input[name="password"]').fill(NEW_PASSWORD);
    await page.locator('input[name="confirmPassword"]').fill(NEW_PASSWORD);
    await page
      .getByRole("button", { name: "Update Password & Go to Dashboard" })
      .click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // 5. A reused (already-exchanged) link cannot reach the form again: a
    //    stale visitor gets the recovery error state with a fresh-link path.
    const stalePage = await browser.newPage();
    try {
      await stalePage.goto(recoveryHref);
      await expect(stalePage).toHaveURL(
        /\/reset-password\?callback_error=auth_callback_failed/,
      );
      await expect(
        stalePage.getByRole("heading", { name: "Recovery link required" }),
      ).toBeVisible();
      await expect(
        stalePage.getByText("That link could not be verified"),
      ).toBeVisible();
      await expect(
        stalePage.getByRole("link", { name: "Request a new reset email" }),
      ).toBeVisible();
    } finally {
      await stalePage.close();
    }

    // 6. The old password is refused and the new one signs in.
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
    // Its own account and password: this scenario must not depend on the
    // password the recovery test sets.
    const owner = await seedActor(admin, {
      providerType: "SHOP",
      role: "OWNER",
    });
    try {
      await signInThroughForm(page, owner);

      await page.goto("/dashboard/settings");

      // Account & security shows the real sign-in email read-only.
      await page.getByRole("tab", { name: "Account" }).click();
      const signInEmailInput = page.locator("#account-signin-email");
      await expect(signInEmailInput).toBeDisabled();
      await expect(signInEmailInput).toHaveValue(owner.email);
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
        owner.email,
      );

      // Sign-in still works with the unchanged password.
      await page.context().clearCookies();
      await signInThroughForm(page, owner);
    } finally {
      await cleanupActors(admin, [owner]);
    }
  });

  test("a recovery link opened while signed in as another account recovers that account", async ({
    page,
  }) => {
    const signedInAs = await seedActor(admin, { providerType: "INDEPENDENT" });
    const recovering = await seedActor(admin, {
      providerType: "SHOP",
      role: "OWNER",
    });
    try {
      await signInThroughForm(page, signedInAs);

      // Request a recovery for the other account from the signed-in browser.
      await purgeRecoveryMailbox(recovering.email);
      await page.goto("/forgot-password");
      await page.locator('input[name="email"]').fill(recovering.email);
      await page.getByRole("button", { name: "Send Reset Link" }).click();
      await expect(page.getByText(NEUTRAL_REQUEST_COPY)).toBeVisible();

      // Opening that link replaces the session with the recovered account,
      // and the form names that account by its masked email.
      const recoveryHref = await findRecoveryLink(recovering.email);
      await page.goto(recoveryHref);
      await expect(page).toHaveURL(/\/reset-password\?flow=recovery/);
      await expect(
        page.getByText(
          `Setting a new password for ${maskedEmail(recovering.email)}`,
        ),
      ).toBeVisible();
      await expect(
        page.getByText(signedInAs.email, { exact: true }),
      ).toHaveCount(0);

      await page.locator('input[name="password"]').fill(NEW_PASSWORD);
      await page.locator('input[name="confirmPassword"]').fill(NEW_PASSWORD);
      await page
        .getByRole("button", { name: "Update Password & Go to Dashboard" })
        .click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

      // The session now belongs to the recovered account, not the first one.
      await page.goto("/dashboard/settings");
      await page.getByRole("tab", { name: "Account" }).click();
      await expect(page.locator("#account-signin-email")).toHaveValue(
        recovering.email,
      );
    } finally {
      await cleanupActors(admin, [signedInAs, recovering]);
    }
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
