import { expect, test } from "@playwright/test";
import {
  cleanupActors,
  createServiceClient,
  loginAndCaptureState,
  seedActor,
} from "./helpers/fixtures";

test("settings keeps desktop navigation beside panels and stacks it on phones", async ({
  browser,
}) => {
  const admin = createServiceClient();
  const owner = await seedActor(admin, {
    providerType: "SHOP",
    serviceModes: ["DROP_OFF"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const switchWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      message.text().includes("default checked state of an uncontrolled Switch")
    )
      switchWarnings.push(message.text());
  });
  try {
    await loginAndCaptureState(page, owner);
    await page.goto("/dashboard/settings");
    const navigation = page.getByRole("tablist", { name: "Settings sections" });
    const profileTab = page.getByRole("tab", { name: "Profile", exact: true });
    const businessTab = page.getByRole("tab", {
      name: "Business",
      exact: true,
    });
    const panel = page.getByRole("tabpanel");
    await expect(navigation).toHaveAttribute("aria-orientation", "vertical");
    const navigationBounds = await navigation.boundingBox();
    const profileBounds = await panel.boundingBox();
    if (!navigationBounds || !profileBounds)
      throw new Error("Settings navigation and panel must be visible");
    expect(navigationBounds.x + navigationBounds.width).toBeLessThan(
      profileBounds.x,
    );

    await profileTab.focus();
    await page.keyboard.press("ArrowDown");
    await expect(businessTab).toBeFocused();
    await businessTab.click();
    await expect(
      page.getByRole("heading", { name: "Business identity" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contact & location" }),
    ).toBeVisible();
    const businessBounds = await panel.boundingBox();
    if (!businessBounds) throw new Error("Business panel must be visible");
    expect(businessBounds.width).toBeCloseTo(profileBounds.width, 0);
    expect(businessBounds.x).toBeCloseTo(profileBounds.x, 0);

    const devices = page.getByRole("group", {
      name: "Supported devices",
      exact: true,
    });
    await devices
      .getByRole("checkbox", { name: "Tablets", exact: true })
      .check();
    const acceptingRequests = page.getByRole("switch", {
      name: "Accept new Repair Requests",
      exact: true,
    });
    const wasAccepting = await acceptingRequests.getAttribute("aria-checked");
    await acceptingRequests.click();
    await page
      .getByRole("button", { name: "Save Provider Profile", exact: true })
      .click();
    await expect(
      page.getByText("Provider profile updated", { exact: true }),
    ).toBeVisible();
    await expect(acceptingRequests).toHaveAttribute(
      "aria-checked",
      wasAccepting === "true" ? "false" : "true",
    );
    expect(switchWarnings).toEqual([]);
    await page.reload();
    await businessTab.click();
    await expect(
      devices.getByRole("checkbox", { name: "Tablets", exact: true }),
    ).toBeChecked();
    await expect(acceptingRequests).toHaveAttribute(
      "aria-checked",
      wasAccepting === "true" ? "false" : "true",
    );

    await page.getByRole("tab", { name: "Service modes", exact: true }).click();
    const otherDetails = page.getByLabel("Other Arrangement Details", {
      exact: true,
    });
    await expect(otherDetails).not.toBeVisible();
    await page.getByText("Other arrangement", { exact: true }).click();
    await expect(otherDetails).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(navigation).not.toHaveAttribute(
      "aria-orientation",
      "vertical",
    );
    await profileTab.click();
    const mobileNavigationBounds = await navigation.boundingBox();
    const mobilePanelBounds = await panel.boundingBox();
    if (!mobileNavigationBounds || !mobilePanelBounds)
      throw new Error("Mobile settings navigation and panel must be visible");
    expect(
      mobileNavigationBounds.y + mobileNavigationBounds.height,
    ).toBeLessThan(mobilePanelBounds.y);
    await profileTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(businessTab).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "Account menu" }).click();
    const menuItems = page.getByRole("menuitem");
    await expect(menuItems).toHaveCount(3);
    await expect(
      page.getByRole("menuitem", { name: "Sign Out", exact: true }),
    ).toBeVisible();
    const menuWidths = await menuItems.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().width),
    );
    expect(Math.max(...menuWidths) - Math.min(...menuWidths)).toBeLessThan(1);
    await page.keyboard.press("Escape");
  } finally {
    await context.close();
    await cleanupActors(admin, [owner]);
  }
});
