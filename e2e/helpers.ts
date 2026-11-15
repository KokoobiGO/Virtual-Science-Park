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
 *
 * When the sign-in fails, the password field is emptied before the error is
 * thrown: the failure's page snapshot (error-context.md, attached to the HTML
 * report) lists every input's value, a password field included.
 */
export async function signInThroughForm(page: Page, email: string): Promise<void> {
  // Generous: the dev server may be recompiling while other people edit files.
  await expect(page.getByLabel("Password")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Email").fill(email);
  try {
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
  } catch (error) {
    await page
      .locator('input[type="password"]')
      .evaluateAll((inputs) => inputs.forEach((input) => ((input as HTMLInputElement).value = "")))
      .catch(() => undefined);
    throw error;
  }
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

/** The display names of the sources that /sources labels "Hand-entered", e.g. "Curated testbed list". */
export async function handEnteredSources(page: Page): Promise<string[]> {
  await open(page, "/sources", "Data status");
  const rows = main(page).locator("li[data-source]");
  await expect(rows.first(), "/sources should list the sources").toBeVisible();
  // The row's first <p> is the source's display name (components/data-status-panel.tsx).
  return rows
    .filter({ has: page.locator('[data-data-status="hand_entered"]') })
    .evaluateAll((els) => els.map((el) => (el.querySelector("p")?.textContent ?? "").trim()).filter(Boolean));
}

/**
 * The data-label rule (D20) on one list of items: every item from a
 * hand-entered source carries a label whose text matches `accept` (by default
 * exactly "Hand-entered", so never "Simulated"). An item's source name is in
 * the line that holds its first badge (kind, labels and source sit together
 * on every list). Returns the problems and what was seen, for the report.
 */
export async function checkHandEnteredLabels(
  rows: Locator,
  sources: string[],
  where: string,
  accept: RegExp = /^Hand-entered$/,
): Promise<{ problems: string[]; seen: Record<string, number>; handEntered: number; total: number }> {
  const items = await rows.evaluateAll(
    (els, names) =>
      els.map((el) => {
        const line = el.querySelector('[data-slot="badge"]')?.parentElement?.textContent ?? "";
        // The shared label (components/data-status-label.tsx), or an older plain badge such as "Simulated data".
        const label =
          el.querySelector("[data-data-status]") ??
          Array.from(el.querySelectorAll('[data-slot="badge"]')).find((b) => /^(Simulated|Hand-entered)/.test((b.textContent ?? "").trim())) ??
          null;
        return {
          source: names.find((name) => line.includes(name)) ?? null,
          kind: label ? (label.getAttribute("data-data-status") ?? "plain badge") : null,
          text: label?.textContent?.trim() ?? null,
          title: (el.querySelector("h3, a")?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
        };
      }),
    sources,
  );
  const problems: string[] = [];
  const seen: Record<string, number> = {};
  let handEntered = 0;
  for (const item of items) {
    if (item.kind === "hand_entered" && !accept.test(item.text ?? "")) {
      problems.push(`${where}: "${item.title}" has the hand_entered label with the text "${item.text}"`);
    }
    if (!item.source) continue;
    handEntered++;
    const key = item.text ? `${item.text} [${item.kind}]` : "no label";
    seen[key] = (seen[key] ?? 0) + 1;
    if (!item.text) problems.push(`${where}: "${item.title}" (${item.source}, hand-entered) has no data label`);
    else if (!accept.test(item.text) && item.kind !== "hand_entered") {
      problems.push(`${where}: "${item.title}" (${item.source}, hand-entered) is labelled "${item.text}" [${item.kind}]`);
    }
  }
  return { problems, seen, handEntered, total: items.length };
}

/**
 * Three structural checks for any page (C20):
 * - exactly one h1;
 * - every button and link has an accessible name;
 * - every form control has a label (a <label>, aria-label, aria-labelledby or
 *   title; a placeholder alone is not a label).
 * Only what a screen reader can reach is inspected: elements that are not
 * rendered, or sit under aria-hidden, [hidden] or [inert], are skipped. A
 * button or link that the quick DOM pass finds unnamed is confirmed with
 * Playwright's own accessible-name computation before it is reported.
 * Returns one line per problem; empty when the page passes.
 */
export async function accessibilityProblems(page: Page): Promise<string[]> {
  const found = await page.evaluate(() => {
    const reachable = (el: Element) =>
      !el.closest('[aria-hidden="true"], [hidden], [inert]') && el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions);
    const describe = (el: Element) => el.outerHTML.replace(/\s+/g, " ").slice(0, 180);
    const byIds = (el: Element, attr: string) =>
      (el.getAttribute(attr) ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
    // The text a screen reader would take from the content: aria-hidden parts left out, alt and aria-label of children used.
    const contentText = (el: Element): string => {
      let text = "";
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
        else if (node instanceof Element) {
          if (node.getAttribute("aria-hidden") === "true") continue;
          if (node.hasAttribute("aria-label")) text += ` ${node.getAttribute("aria-label")}`;
          else if (node.tagName === "IMG") text += ` ${node.getAttribute("alt") ?? ""}`;
          else text += ` ${contentText(node)}`;
        }
      }
      return text;
    };
    const name = (el: Element) =>
      (
        byIds(el, "aria-labelledby") ||
        el.getAttribute("aria-label") ||
        contentText(el) ||
        el.getAttribute("title") ||
        (el instanceof HTMLInputElement ? el.value || el.alt : "") ||
        ""
      ).trim();

    const h1s = Array.from(document.querySelectorAll('h1, [role="heading"][aria-level="1"]'))
      .filter(reachable)
      .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim());

    // Buttons and links: suspects get a temporary data attribute so the caller can confirm them.
    const controls = Array.from(
      document.querySelectorAll('a[href], button, [role="button"], [role="link"], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]'),
    ).filter(reachable);
    const unnamed: { mark: string; html: string }[] = [];
    controls.forEach((el, i) => {
      if (name(el)) return;
      const mark = `e2e-${i}`;
      unnamed.push({ mark, html: describe(el) });
      el.setAttribute("data-e2e-unnamed", mark);
    });

    // Form controls: a real label, not just a placeholder.
    const fields = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea, [role="textbox"], [role="combobox"]',
      ),
    ).filter(reachable);
    const unlabelled: string[] = [];
    for (const el of fields) {
      const labels = "labels" in el ? Array.from((el as HTMLInputElement).labels ?? []) : [];
      const labelled =
        labels.some((l) => (l.textContent ?? "").trim()) ||
        (el.getAttribute("aria-label") ?? "").trim() ||
        byIds(el, "aria-labelledby") ||
        (el.getAttribute("title") ?? "").trim();
      if (!labelled) {
        const placeholder = el.getAttribute("placeholder");
        unlabelled.push(`${describe(el)}${placeholder ? ` (only a placeholder: "${placeholder}")` : ""}`);
      }
    }
    return { h1s, unnamed, unlabelled, controls: controls.length, fields: fields.length };
  });

  const problems: string[] = [];
  if (found.h1s.length !== 1) problems.push(`${found.h1s.length} h1 headings, expected exactly one: ${JSON.stringify(found.h1s)}`);
  for (const suspect of found.unnamed) {
    const element = page.locator(`[data-e2e-unnamed="${suspect.mark}"]`);
    // Playwright's computation: a named node prints as `- button "Name"` (or a /regex/).
    const snapshot = await element.ariaSnapshot().catch(() => "");
    const firstLine = snapshot.split("\n")[0] ?? "";
    if (!/^-\s+\S+\s+["/]/.test(firstLine)) problems.push(`no accessible name: ${suspect.html}${firstLine ? ` (Playwright: ${firstLine.trim()})` : ""}`);
  }
  await page.evaluate(() => document.querySelectorAll("[data-e2e-unnamed]").forEach((el) => el.removeAttribute("data-e2e-unnamed")));
  for (const field of found.unlabelled) problems.push(`form control without a label: ${field}`);
  return problems;
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
