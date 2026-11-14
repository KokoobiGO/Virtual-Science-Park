import type { Page } from "@playwright/test";
import { MEMBER_STATE, STAFF_STATE, accessibilityProblems, expect, main, open, test } from "./helpers";

/**
 * Headings and names (C20) on every page the suite visits: exactly one h1,
 * no button or link without an accessible name, no form control without a
 * label. One test per page, so each page's problems are listed on their own.
 * Opens pages only; presses nothing.
 */

type Visit = { path: string; heading: string | RegExp };

const SIGNED_OUT: Visit[] = [
  { path: "/", heading: /opportunities/ },
  { path: "/sign-in", heading: "Sign in" },
  { path: "/no-such-page-e2e", heading: "Page not found" },
];

const MEMBER: Visit[] = [
  { path: "/", heading: /.+/ },
  { path: "/week", heading: "Your week" },
  { path: "/profile", heading: /.+/ },
  { path: "/profile/malvacom", heading: /Malvacom/i },
  { path: "/explore", heading: "Explore" },
  { path: "/explore?view=timeline", heading: "Explore" },
  { path: "/explore?view=map", heading: "Explore" },
  { path: "/scout", heading: "Scout" },
  { path: "/copilot", heading: "Copilot" },
  { path: "/trust", heading: "Trust report" },
  { path: "/sources", heading: "Data status" },
  { path: "/profile/no-such-company", heading: "No company with this address" },
];

const STAFF: Visit[] = [
  { path: "/staff/compare?a=embeddedart&b=malvacom", heading: "Compare members" },
  { path: "/staff/ecosystem", heading: "Ecosystem map" },
  { path: "/profile", heading: "Company profiles" },
  { path: "/profile/embeddedart", heading: /EmbeddedArt/i },
  { path: "/staff/handoffs", heading: "Handoffs" },
  { path: "/staff/injection-demo", heading: "Planted instruction test" },
  { path: "/staff/checks", heading: /.+/ },
  { path: "/trust", heading: "Trust report" },
  { path: "/explore", heading: "Explore" },
  { path: "/sources", heading: "Data status" },
];

async function check(page: Page, { path, heading }: Visit) {
  await open(page, path, heading);
  // Every streamed section in: the "load" event waits for the whole response, then no loading placeholder is left.
  await page.waitForLoadState("load");
  await expect(main(page).getByText(/^Loading/)).toHaveCount(0);
  const problems = await accessibilityProblems(page);
  expect(problems, `${path}:\n${problems.join("\n")}`).toEqual([]);
}

test.describe("a11y, signed out", () => {
  for (const visit of SIGNED_OUT) {
    test(`a11y (signed out): ${visit.path} has one h1, named buttons and links, labelled fields`, async ({ page }) => {
      await check(page, visit);
    });
  }
});

test.describe("a11y, member", () => {
  test.use({ storageState: MEMBER_STATE });
  for (const visit of MEMBER) {
    test(`a11y (member): ${visit.path} has one h1, named buttons and links, labelled fields`, async ({ page }) => {
      await check(page, visit);
    });
  }
});

test.describe("a11y, staff", () => {
  test.use({ storageState: STAFF_STATE });
  for (const visit of STAFF) {
    test(`a11y (staff): ${visit.path} has one h1, named buttons and links, labelled fields`, async ({ page }) => {
      await check(page, visit);
    });
  }
});
