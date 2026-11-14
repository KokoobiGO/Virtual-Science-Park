import type { Page } from "@playwright/test";
import { expect, horizontalOverflow, main, open, test } from "./helpers";

/**
 * One pass of the member path at a phone width (375 px, see the "phone"
 * project in playwright.config.ts): the page must never scroll sideways.
 * Read-only.
 */

async function expectNoSideScroll(page: Page, path: string) {
  // Let late content (streamed sections, fonts) settle before measuring.
  await page.waitForLoadState("load");
  await expect(main(page).getByText(/^Loading/)).toHaveCount(0);
  const { overflow, widest } = await horizontalOverflow(page);
  expect(overflow, `${path} scrolls sideways by ${overflow}px at 375px wide. Elements past the right edge:\n${widest.join("\n")}`).toBe(0);
}

test("phone: /week does not scroll sideways", async ({ page }) => {
  await open(page, "/week", "Your week");
  await expect(main(page).locator('ol > li [data-slot="card"]').first()).toBeVisible();
  await expectNoSideScroll(page, "/week");
});

test("phone: /profile does not scroll sideways", async ({ page }) => {
  await open(page, "/profile", /.+/);
  await expect(main(page).getByRole("heading", { level: 2, name: "Profile", exact: true })).toBeVisible();
  await expectNoSideScroll(page, "/profile");
});

test("phone: /explore does not scroll sideways", async ({ page }) => {
  await open(page, "/explore", "Explore");
  await expect(main(page).getByText(/opportunities/).first()).toBeVisible();
  await expectNoSideScroll(page, "/explore");
});

test("phone: the Menu button opens the member menu", async ({ page }) => {
  await open(page, "/week", "Your week");
  const menu = page.getByRole("navigation", { name: "Member menu" });
  await expect(menu, "the menu links are folded away on a phone").toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Explore" })).toBeVisible();
});
