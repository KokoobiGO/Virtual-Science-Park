import type { Page } from "@playwright/test";
import { STAFF_STATE, expect, horizontalOverflow, main, open, test } from "./helpers";

/**
 * One pass of the member path, and the two staff views, at a phone width
 * (375 px, see the "phone" project in playwright.config.ts): the page must
 * never scroll sideways. Read-only.
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

// The timeline's month bars once pushed the page 433 px past the right edge at this width (fixed 14 Nov 2026): keep it fixed.
test("phone: /explore?view=timeline does not scroll sideways", async ({ page }) => {
  await open(page, "/explore?view=timeline", "Explore");
  await expect(main(page).getByRole("heading", { name: "Funding call deadlines" })).toBeVisible();
  await expect(main(page).getByRole("heading", { name: "Events", exact: true })).toBeVisible();
  await expectNoSideScroll(page, "/explore?view=timeline");
});

/** More member pages: each must settle (its own content is there) before it is measured. */
const MEMBER_PAGES: { path: string; heading: string | RegExp; ready: (page: Page) => Promise<void> }[] = [
  {
    path: "/explore?view=map",
    heading: "Explore",
    ready: (page) => expect(main(page).getByRole("group", { name: /^Sketch map of southern Sweden/ })).toBeVisible(),
  },
  { path: "/scout", heading: "Scout", ready: (page) => expect(main(page).getByRole("heading", { name: "Your briefs" })).toBeVisible() },
  { path: "/copilot", heading: "Copilot", ready: (page) => expect(main(page).getByRole("textbox", { name: "Your question" })).toBeVisible() },
  { path: "/trust", heading: "Trust report", ready: (page) => expect(main(page).getByRole("heading", { level: 2, name: "Red-team tests" })).toBeVisible() },
  { path: "/sources", heading: "Data status", ready: (page) => expect(main(page).locator("li[data-source]").first()).toBeVisible() },
  {
    path: "/profile/malvacom",
    heading: /Malvacom/i,
    ready: (page) => expect(main(page).getByRole("heading", { level: 2, name: "Public profile" })).toBeVisible(),
  },
];

for (const { path, heading, ready } of MEMBER_PAGES) {
  test(`phone: ${path} does not scroll sideways`, async ({ page }) => {
    await open(page, path, heading);
    await ready(page);
    await expectNoSideScroll(page, path);
  });
}

test.describe("phone, staff", () => {
  test.use({ storageState: STAFF_STATE });

  test("phone: /staff/compare (EmbeddedArt and Malvacom) does not scroll sideways", async ({ page }) => {
    const path = "/staff/compare?a=embeddedart&b=malvacom";
    await open(page, path, "Compare members");
    await expect(main(page).locator('.grid > [data-slot="card"]')).toHaveCount(2);
    await expectNoSideScroll(page, path);
  });

  test("phone: /staff/ecosystem does not scroll sideways", async ({ page }) => {
    await open(page, "/staff/ecosystem", "Ecosystem map");
    await expect(main(page).getByRole("group", { name: /^Graph of \d+ members/ })).toBeVisible();
    await expectNoSideScroll(page, "/staff/ecosystem");
  });
});

test("phone: the Menu button opens the member menu", async ({ page }) => {
  await open(page, "/week", "Your week");
  const menu = page.getByRole("navigation", { name: "Member menu" });
  await expect(menu, "the menu links are folded away on a phone").toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Explore" })).toBeVisible();
});
