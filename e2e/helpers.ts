import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";

export { expect };

/** Saved sessions (cookies), in the git-ignored e2e/.auth/ folder. */
export const MEMBER_STATE = "e2e/.auth/member.json";
export const STAFF_STATE = "e2e/.auth/staff.json";

/** The member account the demo walks through, and the staff account. */
export const MEMBER = DEMO_ACCOUNTS.find((a) => a.email.startsWith("embeddedart@"))!;
export const STAFF = DEMO_ACCOUNTS.find((a) => a.role === "staff")!;

/** A date as the screens print it: "14 Nov 2026" or "14 November 2026". */
export const DATE_TEXT = /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/;

/**
 * The test function with one automatic extra: every browser console error and
 * uncaught page error during a test is added to the test's annotations, so
 * the report (and RESULTS.md) can quote it. They do not fail a test by
 * themselves; a test asserts on them where the step says so.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console.error on ${new URL(page.url()).pathname}: ${msg.text().slice(0, 400)}`);
      });
      page.on("pageerror", (err) => errors.push(`page error on ${new URL(page.url()).pathname}: ${err.message.slice(0, 400)}`));
      await use(errors);
      for (const e of errors) testInfo.annotations.push({ type: "browser error", description: e });
    },
    { auto: true },
  ],
});

function demoPassword(): string {
  const value = process.env.DEMO_USER_PASSWORD;
  if (!value) {
    throw new Error(
      "DEMO_USER_PASSWORD is not set. Run the suite with `npm run e2e`, which loads .env.local into the test process.",
    );
  }
  return value;
}

/** The main region of the page (the layout wraps every page in <main id="main">). */
export function main(page: Page): Locator {
  return page.locator("main#main");
}

/**
 * Sign in through the real form on /sign-in. The password is set with an
 * evaluate call rather than fill(): Playwright titles a fill step with the
 * typed value, which would put the password into the report.
 */
export async function signInThroughForm(page: Page, email: string): Promise<void> {
  // Generous: the dev server may be recompiling while other people edit files.
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
  }, demoPassword());
  // The header also has a "Sign in" control, so use the one in the form.
  await main(page).getByRole("button", { name: "Sign in", exact: true }).click();
  // A failed sign-in shows the form's error; surface its text instead of a bare timeout.
  // (Not getByRole("alert"): Next's route announcer is an alert too.)
  const alert = page.locator("#sign-in-error");
  await expect(async () => {
    if (await alert.isVisible()) throw new Error(`Sign-in form said: "${await alert.innerText()}"`);
    expect(new URL(page.url()).pathname).not.toBe("/sign-in");
  }).toPass({ timeout: 30_000 });
}

/**
 * Open a page and wait until its own heading is there. Fails with the text
 * of Next's error page or dev overlay when the page crashed, rather than a
 * bare timeout.
 */
export async function open(page: Page, path: string, heading: string | RegExp): Promise<void> {
  const response = await page.goto(path);
  const h1 = page.getByRole("heading", { level: 1, name: heading });
  try {
    await expect(h1).toBeVisible({ timeout: 45_000 });
  } catch (error) {
    const status = response?.status();
    const title = await page.title().catch(() => "");
    const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600);
    throw new Error(
      `${path}: no h1 "${heading}" (HTTP ${status}, now at ${new URL(page.url()).pathname}, title "${title}"). Page text: "${body}"`,
      { cause: error },
    );
  }
}

/**
 * How far the page itself scrolls sideways, in CSS pixels (0 when it does not),
 * found by trying to scroll it. `widest` names the elements that stick out.
 */
export async function horizontalOverflow(page: Page): Promise<{ overflow: number; widest: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    window.scrollTo(10_000, window.scrollY);
    const overflow = Math.round(window.scrollX);
    window.scrollTo(0, window.scrollY);
    // Name the elements that stick out, so a failure says where to look.
    const widest: string[] = [];
    if (overflow > 0) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const rect = el.getBoundingClientRect();
        if (rect.right > doc.clientWidth + 1 && rect.width > 0) {
          const id = el.id ? `#${el.id}` : "";
          const cls = typeof el.className === "string" && el.className ? `.${el.className.split(/\s+/).slice(0, 4).join(".")}` : "";
          const text = (el.innerText ?? el.textContent ?? "").slice(0, 60).replace(/\s+/g, " ");
          widest.push(`${el.tagName.toLowerCase()}${id}${cls} (right edge ${Math.round(rect.right)}px): "${text}"`);
          if (widest.length >= 6) break;
        }
      }
    }
    return { overflow, widest };
  });
}
