import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { LOCALE_COOKIE, LOCALE_NAMES } from "../lib/i18n/config";
import { NAV } from "../lib/navigation";
import { MEMBER_STATE, STAFF_STATE, expect, main, open, test } from "./helpers";

/**
 * Site-wide pieces that are not one screen: the Copilot side panel, the
 * not-found pages and the language switch. Each describe signs in as one
 * role (or none) through a saved session. Nothing here writes data: the
 * Copilot sheet is opened and closed, no question is sent.
 */

/** The Copilot launcher at the bottom right (components/copilot/copilot-launcher.tsx). */
function launcher(page: Page) {
  return page.getByTestId("copilot-launcher");
}

/**
 * Wait until the whole streamed page is in: the "load" event fires only after
 * the server has sent every Suspense boundary, the launcher's included, so a
 * launcher that is not in the page by then is not coming.
 */
async function settled(page: Page) {
  await page.waitForLoadState("load");
  await expect(main(page).getByText(/^Loading/)).toHaveCount(0);
}

test.describe("10. Copilot side panel, member", () => {
  test.use({ storageState: MEMBER_STATE });

  test("10a. on a member page the launcher opens the sheet with the question field focused; Escape closes it and focus returns", async ({
    page,
  }) => {
    await open(page, "/week", "Your week");
    const button = launcher(page);
    await expect(button, "the Copilot launcher should be on /week").toBeVisible();
    await expect(button).toHaveAccessibleName("Copilot");

    await button.click();
    const sheet = page.getByRole("dialog", { name: "Copilot" });
    await expect(sheet, "the launcher opens a dialog named Copilot").toBeVisible();
    const question = sheet.getByRole("textbox", { name: "Your question" });
    await expect(question, "focus moves to the question field").toBeFocused();
    await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    // Nothing is asked: the conversation is still empty.
    await expect(sheet.getByRole("list", { name: "Conversation" })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(sheet, "Escape closes the sheet").toBeHidden();
    await expect(button, "focus returns to the launcher").toBeFocused();
  });

  test("10b. there is no launcher on /copilot (loaded directly, or reached from the menu)", async ({ page }) => {
    await open(page, "/copilot", "Copilot");
    await expect(main(page).getByRole("textbox", { name: "Your question" })).toBeVisible();
    await settled(page);
    await expect(launcher(page), "/copilot has the chat on the page, so no launcher").toHaveCount(0);

    // From a page that has it, through the menu: the launcher goes away on /copilot.
    await open(page, "/explore", "Explore");
    await expect(launcher(page)).toBeVisible();
    await page.getByRole("navigation", { name: "Member menu" }).getByRole("link", { name: "Copilot", exact: true }).click();
    await expect(page).toHaveURL(/\/copilot$/);
    await expect(page.getByRole("heading", { level: 1, name: "Copilot" })).toBeVisible();
    await expect(launcher(page), "the launcher hides after a client-side move to /copilot").toHaveCount(0);
  });
});

test.describe("10. Copilot side panel, staff", () => {
  test.use({ storageState: STAFF_STATE });

  test("10c. staff get no launcher (on a staff page and on a shared page)", async ({ page }) => {
    for (const [path, heading] of [
      ["/staff/compare", "Compare members"],
      ["/explore", "Explore"],
    ] as const) {
      await open(page, path, heading);
      await expect(page.getByRole("navigation", { name: "Staff menu" })).toBeVisible();
      await settled(page);
      await expect(launcher(page), `staff should have no Copilot launcher on ${path}`).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Copilot", exact: true })).toHaveCount(0);
    }
  });
});

test.describe("10. Copilot side panel, signed out", () => {
  test("10d. no launcher when signed out (start page, sign-in page)", async ({ page }) => {
    for (const path of ["/", "/sign-in"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 45_000 });
      // The header has streamed in: it offers "Sign in", so the session was read as signed out.
      await expect(page.getByRole("banner").getByRole("button", { name: "Sign in" })).toBeVisible();
      await settled(page);
      await expect(launcher(page), `no Copilot launcher on ${path} when signed out`).toHaveCount(0);
    }
  });
});

/** Every h1 on the page, as text. */
async function h1s(page: Page): Promise<string[]> {
  return (await page.locator("h1").allInnerTexts()).map((t) => t.trim());
}

test.describe("11. not-found pages, member", () => {
  test.use({ storageState: MEMBER_STATE });

  test("11a. an unknown address shows 'Page not found' with one h1", async ({ page }) => {
    const response = await page.goto("/no-such-page-e2e");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible({ timeout: 45_000 });
    await settled(page);
    expect(await h1s(page), "exactly one h1").toEqual(["Page not found"]);
    expect(response?.status(), "an unknown address answers 404").toBe(404);
    await expect(main(page).getByRole("button", { name: "Go to the start page" })).toHaveAttribute("href", "/");
    await expect(page, "the tab says so too").toHaveTitle(/^Page not found/);
  });

  test("11b. /profile/no-such-company shows the company not-found page", async ({ page }) => {
    const response = await page.goto("/profile/no-such-company");
    await expect(page.getByRole("heading", { level: 1, name: "No company with this address" })).toBeVisible({ timeout: 45_000 });
    await settled(page);
    expect(await h1s(page), "exactly one h1").toEqual(["No company with this address"]);
    await expect(main(page).getByRole("button", { name: "Go to Company profile" })).toHaveAttribute("href", "/profile");
    // notFound() runs inside a Suspense boundary, after the 200 has been sent (Next.js keeps it and adds noindex).
    const robots = await page.locator('meta[name="robots"]').evaluateAll((metas) => metas.map((m) => m.getAttribute("content")));
    test.info().annotations.push({ type: "status", description: `HTTP ${response?.status()}, robots meta ${JSON.stringify(robots)}` });
  });
});

test.describe("11. not-found pages, signed out", () => {
  test("11c. an unknown address shows 'Page not found' when signed out too", async ({ page }) => {
    const response = await page.goto("/no-such-page-e2e");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible({ timeout: 45_000 });
    await settled(page);
    expect(await h1s(page)).toEqual(["Page not found"]);
    expect(response?.status()).toBe(404);
  });
});

test.describe("12. language switch, member", () => {
  test.use({ storageState: MEMBER_STATE });

  type Catalogue = { layout: Record<string, string>; nav: Record<string, { label: string }> };
  const EN = JSON.parse(readFileSync("messages/en.json", "utf8")) as Catalogue;
  const SV = JSON.parse(readFileSync("messages/sv.json", "utf8")) as Catalogue;
  const menuTexts = (catalogue: Catalogue) => NAV.member.map((item) => catalogue.nav[item.id].label);

  test("12. Svenska changes the menu texts, English restores them, and other sessions stay English", async ({ page, browser }) => {
    await open(page, "/week", "Your week");
    const englishMenu = page.getByRole("navigation", { name: EN.layout.memberMenu });
    await expect(englishMenu).toBeVisible();
    const switcher = page.getByRole("banner").getByRole("group", { name: EN.layout.language });
    if (!(await switcher.count())) {
      test.info().annotations.push({ type: "not exercised", description: "the header has no language switch yet" });
      test.skip(true, "the header has no language switch yet");
    }

    // English is the default: no cookie, English texts, <html lang="en">.
    const englishTexts = menuTexts(EN);
    await expect(englishMenu.getByRole("link")).toHaveText(englishTexts);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(switcher.getByRole("button", { name: LOCALE_NAMES.en })).toHaveAttribute("aria-pressed", "true");

    // Svenska.
    await switcher.getByRole("button", { name: LOCALE_NAMES.sv }).click();
    const swedishMenu = page.getByRole("navigation", { name: SV.layout.memberMenu });
    await expect(swedishMenu, `the menu should be named "${SV.layout.memberMenu}"`).toBeVisible();
    await expect(swedishMenu.getByRole("link")).toHaveText(menuTexts(SV));
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
    const swedishSwitch = page.getByRole("banner").getByRole("group", { name: SV.layout.language });
    await expect(swedishSwitch.getByRole("button", { name: LOCALE_NAMES.sv })).toHaveAttribute("aria-pressed", "true");
    const cookie = (await page.context().cookies()).find((c) => c.name === LOCALE_COOKIE);
    expect(cookie?.value, `the choice is kept in the ${LOCALE_COOKIE} cookie`).toBe("sv");
    test.info().annotations.push({
      type: "Swedish",
      description: `menu: ${menuTexts(SV).join(", ")}; h1 now "${(await page.locator("h1").first().innerText()).trim()}"`,
    });

    // The choice belongs to this browser only: the saved session the other tests use has no language cookie,
    // and a second browser with that session still reads English.
    const saved = JSON.parse(readFileSync(MEMBER_STATE, "utf8")) as { cookies: { name: string }[] };
    expect(saved.cookies.map((c) => c.name), "the saved member session carries no language cookie").not.toContain(LOCALE_COOKIE);
    const baseURL = test.info().project.use.baseURL;
    expect(baseURL, "the project's baseURL").toBeTruthy();
    const other = await browser.newContext({ baseURL, storageState: MEMBER_STATE });
    try {
      const otherPage = await other.newPage();
      await open(otherPage, "/week", "Your week");
      await expect(otherPage.getByRole("navigation", { name: EN.layout.memberMenu }).getByRole("link")).toHaveText(englishTexts);
      await expect(otherPage.locator("html")).toHaveAttribute("lang", "en");
    } finally {
      await other.close();
    }

    // Back to English.
    await swedishSwitch.getByRole("button", { name: LOCALE_NAMES.en }).click();
    await expect(englishMenu).toBeVisible();
    await expect(englishMenu.getByRole("link")).toHaveText(englishTexts);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Your week" })).toBeVisible();
  });
});

