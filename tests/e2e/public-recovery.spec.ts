import { expect, test } from "@playwright/test";

test("unknown routes show a branded 404 with recovery navigation", async ({
  page,
}) => {
  const response = await page.goto("/__tracknologia_missing_page__");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "We couldn’t find that page.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
