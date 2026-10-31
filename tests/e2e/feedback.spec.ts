import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupActors,
  createServiceClient,
  loginAndCaptureState,
  seedActor,
  supabaseUrl,
  type SeedOptions,
  type TestActor,
} from "./helpers/fixtures";
import { runLocalSql } from "../helpers/local-postgres";

// Each scenario writes titles that start with a per-run marker, so every read
// and cleanup is scoped to this run. The feedback_submit limiter is shared by
// every request in the dev bucket, so each scenario resets its row first.

type FeedbackAdmin = ReturnType<typeof createServiceClient>;

const SUCCESS_COPY =
  "Thanks! We got your feedback. We read everything, but we can't reply to each message.";
const TITLE_TOO_LONG_COPY =
  "That title is a bit long. Please keep it under 120 characters.";
const THROTTLED_COPY =
  "You've sent a lot in a short time. Please wait a few minutes and try again.";
const CONTACT_WARNING_COPY =
  "This looks like a phone number or email address. Please remove it before sending.";

function successStatus(page: Page) {
  return page.getByRole("status").filter({ hasText: SUCCESS_COPY });
}

function throttleAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: THROTTLED_COPY });
}

async function resetFeedbackLimiter() {
  await runLocalSql(
    supabaseUrl,
    "delete from public.public_operation_rate_limits where operation = 'feedback_submit';",
  );
}

async function cleanupFeedbackRows(marker: string) {
  await runLocalSql(
    supabaseUrl,
    `delete from public.feedback_submissions where title like '${marker}%';`,
  );
}

async function storedRowsFor(admin: FeedbackAdmin, marker: string) {
  const { data, error } = await admin
    .from("feedback_submissions")
    .select("category, source, participant_class")
    .like("title", `${marker}%`);
  if (error) {
    throw new Error(`[E2E fixture] feedback row read failed: ${error.message}`);
  }
  return data ?? [];
}

async function chooseCategory(page: Page, label: string) {
  await page.getByRole("radio", { name: label, exact: true }).check();
}

async function fillAndSubmit(
  page: Page,
  { label, title, message }: { label: string; title: string; message: string },
) {
  await chooseCategory(page, label);
  await page.getByLabel("Title (optional)").fill(title);
  await page.getByLabel("Message", { exact: true }).fill(message);
  await page
    .getByRole("button", { name: "Send feedback", exact: true })
    .click();
}

test.describe("E2E-10 Participant feedback forms", () => {
  test("an anonymous visitor reaches /feedback from Tracking and sends each category", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const runId = randomUUID().slice(0, 8);
    const marker = `e2e-fb91-${runId}-public`;
    await resetFeedbackLimiter();

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto("/track");
      await page
        .getByRole("link", { name: "Send feedback", exact: true })
        .click();
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: "Send feedback", level: 1 }),
      ).toBeVisible();

      const url = new URL(page.url());
      expect(url.pathname).toBe("/feedback");
      expect(url.search).toBe("");

      // Only the category, title and message are collected: no identity or
      // code inputs are offered to an anonymous visitor.
      await expect(page.getByRole("textbox")).toHaveCount(2);
      const identityFields = page.locator(
        'input[type="email"], input[type="tel"], input[name="name"], input[name="trackingCode"]',
      );
      await expect(identityFields).toHaveCount(0);

      const categories = [
        {
          label: "Bug Report",
          value: "BUG",
          prompt:
            "Something not working? Tell us what you were doing and what went wrong.",
        },
        {
          label: "Usability",
          value: "USABILITY",
          prompt: "Was something confusing or hard to use?",
        },
        {
          label: "Feature Request",
          value: "FEATURE_REQUEST",
          prompt: "What would make Tracknologia more useful for you?",
        },
        {
          label: "General",
          value: "GENERAL",
          prompt: "Anything else you'd like to tell us?",
        },
      ];

      // Typing contact details shows the warning; clearing the text hides it.
      const messageBox = page.getByLabel("Message", { exact: true });
      await messageBox.fill("call me 0917 123 4567");
      await expect(
        page.getByText(CONTACT_WARNING_COPY, { exact: true }),
      ).toBeVisible();
      await messageBox.fill("");
      await expect(
        page.getByText(CONTACT_WARNING_COPY, { exact: true }),
      ).toHaveCount(0);

      for (const [index, category] of categories.entries()) {
        if (index > 0) {
          await page
            .getByRole("button", { name: "Send more feedback", exact: true })
            .click();
        }
        await chooseCategory(page, category.label);
        await expect(
          page.getByText(category.prompt, { exact: true }),
        ).toBeVisible();

        await fillAndSubmit(page, {
          label: category.label,
          title: `${marker}-${category.value.toLowerCase()}`,
          message: `Public ${category.label} text ${runId}`,
        });
        await expect(successStatus(page)).toHaveText(SUCCESS_COPY);
      }

      const rows = await storedRowsFor(admin, `${marker}-`);
      const summary = rows
        .map((row) => `${row.category}|${row.source}|${row.participant_class}`)
        .sort();
      expect(summary).toEqual([
        "BUG|PUBLIC_FEEDBACK|PUBLIC_SELF_REPORTED_CUSTOMER",
        "FEATURE_REQUEST|PUBLIC_FEEDBACK|PUBLIC_SELF_REPORTED_CUSTOMER",
        "GENERAL|PUBLIC_FEEDBACK|PUBLIC_SELF_REPORTED_CUSTOMER",
        "USABILITY|PUBLIC_FEEDBACK|PUBLIC_SELF_REPORTED_CUSTOMER",
      ]);
    } finally {
      await context.close();
      await cleanupFeedbackRows(marker);
      await resetFeedbackLimiter();
    }
  });

  test("a 121-character title is refused in place and keeps the typed text", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const runId = randomUUID().slice(0, 8);
    const marker = `e2e-fb91-${runId}-long`;
    const longTitle = marker.padEnd(121, "x");
    const message = `Validation text ${runId}`;
    await resetFeedbackLimiter();

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto("/feedback");
      await page.waitForLoadState("networkidle");
      await fillAndSubmit(page, {
        label: "Bug Report",
        title: longTitle,
        message,
      });

      await expect(
        page.getByText(TITLE_TOO_LONG_COPY, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: "Bug Report", exact: true }),
      ).toBeChecked();
      await expect(page.getByLabel("Title (optional)")).toHaveValue(longTitle);
      await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
        message,
      );

      // An edited retry that is refused again keeps keyboard focus on the title.
      // Wait for the rotated nonce: the first rejection shows the same error,
      // so only the new response proves the second round finished.
      const longerTitle = marker.padEnd(122, "y");
      const hiddenNonce = page.locator('input[name="submissionNonce"]');
      const firstNonce = await hiddenNonce.inputValue();
      await page.getByLabel("Title (optional)").fill(longerTitle);
      await page.getByLabel("Title (optional)").press("Enter");
      await expect(hiddenNonce).not.toHaveValue(firstNonce);

      await expect(
        page.getByText(TITLE_TOO_LONG_COPY, { exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Title (optional)")).toBeFocused();
      await expect(page.getByLabel("Title (optional)")).toHaveValue(
        longerTitle,
      );
      await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
        message,
      );

      expect(await storedRowsFor(admin, marker)).toHaveLength(0);
    } finally {
      await context.close();
      await cleanupFeedbackRows(marker);
      await resetFeedbackLimiter();
    }
  });

  test("the twenty-first submission in a window is throttled and keeps the text", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const admin = createServiceClient();
    const runId = randomUUID().slice(0, 8);
    const marker = `e2e-fb91-${runId}-throttle`;
    await resetFeedbackLimiter();

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto("/feedback");
      await page.waitForLoadState("networkidle");
      for (let index = 1; index <= 20; index += 1) {
        await fillAndSubmit(page, {
          label: "General",
          title: `${marker}-${index}`,
          message: `Throttle text ${index} ${runId}`,
        });
        await expect(successStatus(page)).toHaveText(SUCCESS_COPY);
        await page
          .getByRole("button", { name: "Send more feedback", exact: true })
          .click();
      }

      const overflowTitle = `${marker}-21`;
      const overflowMessage = `Throttle text 21 ${runId}`;
      await fillAndSubmit(page, {
        label: "General",
        title: overflowTitle,
        message: overflowMessage,
      });

      await expect(throttleAlert(page)).toHaveCount(1);
      await expect(page.getByLabel("Title (optional)")).toHaveValue(
        overflowTitle,
      );
      await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
        overflowMessage,
      );

      expect(await storedRowsFor(admin, marker)).toHaveLength(20);
    } finally {
      await context.close();
      await cleanupFeedbackRows(marker);
      await resetFeedbackLimiter();
    }
  });

  test("Provider roles send feedback from the nav with their trusted class", async ({
    browser,
  }) => {
    const admin = createServiceClient();
    const runId = randomUUID().slice(0, 8);
    const marker = `e2e-fb91-${runId}-provider`;
    // Team & Staff is Shop-only, not Owner-only: every SHOP member sees it.
    const cases: Array<{
      options: SeedOptions;
      participantClass: string;
      hasTeamLink: boolean;
    }> = [
      {
        options: { providerType: "SHOP", role: "OWNER" },
        participantClass: "SHOP_OWNER",
        hasTeamLink: true,
      },
      {
        options: { providerType: "SHOP", role: "STAFF" },
        participantClass: "SHOP_STAFF",
        hasTeamLink: true,
      },
      {
        options: { providerType: "INDEPENDENT" },
        participantClass: "INDEPENDENT_REPAIRER",
        hasTeamLink: false,
      },
    ];
    const actors: TestActor[] = [];
    await resetFeedbackLimiter();

    try {
      const anonymousContext = await browser.newContext();
      const anonymousPage = await anonymousContext.newPage();
      await anonymousPage.goto("/dashboard/feedback");
      await expect(anonymousPage).toHaveURL(/\/login/);
      await anonymousContext.close();

      for (const [index, testCase] of cases.entries()) {
        const actor = await seedActor(admin, testCase.options);
        actors.push(actor);

        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await loginAndCaptureState(page, actor);

          const nav = page.getByRole("navigation", {
            name: "Provider navigation",
          });
          const teamLinks = nav.getByRole("link", { name: "Team & Staff" });
          await expect(teamLinks).toHaveCount(testCase.hasTeamLink ? 1 : 0);
          await nav
            .getByRole("link", { name: "Feedback", exact: true })
            .click();
          await expect(page).toHaveURL(/\/dashboard\/feedback$/);
          await page.waitForLoadState("networkidle");

          const title = `${marker}-${index}`;
          await fillAndSubmit(page, {
            label: "Usability",
            title,
            message: `Provider text ${index} ${runId}`,
          });
          await expect(successStatus(page)).toHaveText(SUCCESS_COPY);

          const rows = await storedRowsFor(admin, title);
          expect(rows).toEqual([
            {
              category: "USABILITY",
              source: "PROVIDER_WORKSPACE",
              participant_class: testCase.participantClass,
            },
          ]);
        } finally {
          await context.close();
        }
      }
    } finally {
      await cleanupFeedbackRows(marker);
      await resetFeedbackLimiter();
      await cleanupActors(admin, actors);
    }
  });

  test("an anonymous visitor can open the privacy page", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const response = await page.goto("/privacy");
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "How Tracknologia handles your information",
          level: 1,
        }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("the public form fits a 375px phone and its submit is keyboard reachable", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/feedback");
      await page.waitForLoadState("networkidle");

      const fitsWidth = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fitsWidth).toBe(true);

      await page.getByLabel("Message", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("button", { name: "Send feedback", exact: true }),
      ).toBeFocused();
    } finally {
      await context.close();
    }
  });
});
