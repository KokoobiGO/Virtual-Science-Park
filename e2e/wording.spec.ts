import type { Page } from "@playwright/test";
import { MEMBER_STATE, STAFF_STATE, expect, test } from "./helpers";

/**
 * Product rule: the system never decides eligibility, so our own labels and
 * headings never say "eligible" or "eligibility". Text quoted from a call or
 * written by a user may contain the word, so the check skips the places that
 * show such text (opportunity titles, quotes, Scout questions and option
 * titles). Opens pages only; presses nothing.
 */

const WORD = /eligib/i;

/** Selectors for interface labels and headings. */
const LABELS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "label",
  "button",
  "[role=button]",
  "th",
  // The first cell of a table row labels the row (the Trust report's groups, modes and sources).
  "tbody td:first-child",
  "summary",
  "legend",
  "option",
  "nav a",
  '[data-slot="badge"]',
  '[data-slot="card-title"]',
].join(",");

/** Places whose text comes from a source or a user, not from us. */
const DATA_TEXT = [
  "blockquote",
  "mark",
  // /week: the opportunity title of each card.
  'ol > li [data-slot="card"] [data-slot="card-title"]',
  // /scout: option titles, the asked question and the list of earlier questions.
  'article [data-slot="card-title"]',
  "article > header",
  "aside li button",
].join(",");

type Hit = { page: string; element: string; text: string };

async function scan(page: Page, path: string): Promise<{ labels: Hit[]; elsewhere: Hit[] }> {
  await page.goto(path);
  await expect(page.locator("main#main h1")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("main#main").getByText(/^Loading/)).toHaveCount(0);
  return page.evaluate(
    ({ labels, dataText, source, path }) => {
      const word = new RegExp(source, "i");
      const describe = (el: Element) => `<${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? ` data-slot="${el.getAttribute("data-slot")}"` : ""}>`;
      const labelHits: { page: string; element: string; text: string }[] = [];
      for (const el of Array.from(document.querySelectorAll(labels))) {
        if (el.closest(dataText)) continue;
        const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
        if (word.test(text)) labelHits.push({ page: path, element: describe(el), text: text.trim().slice(0, 200) });
      }
      // Attributes that screen readers or the browser show as our labels.
      for (const el of Array.from(document.querySelectorAll("[aria-label],[placeholder]"))) {
        if (el.closest(dataText)) continue;
        for (const attr of ["aria-label", "placeholder"]) {
          const value = el.getAttribute(attr) ?? "";
          if (attr === "aria-label" && value.startsWith("Actions for ")) continue; // "Actions for <opportunity title>"
          if (word.test(value)) labelHits.push({ page: path, element: `${describe(el)} ${attr}`, text: value.slice(0, 200) });
        }
      }
      if (word.test(document.title)) labelHits.push({ page: path, element: "<title>", text: document.title });

      // Everything else on the page that says it, for the record (paragraphs may quote calls).
      const elsewhere: { page: string; element: string; text: string }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || !word.test(node.textContent ?? "")) continue;
        if (parent.closest(labels) && !parent.closest(dataText)) continue; // already counted above
        if (parent.closest("script,style")) continue;
        elsewhere.push({ page: path, element: describe(parent), text: (node.textContent ?? "").trim().slice(0, 200) });
      }
      return { labels: labelHits, elsewhere };
    },
    { labels: LABELS, dataText: DATA_TEXT, source: WORD.source, path },
  );
}

async function checkPages(page: Page, paths: string[]) {
  const labels: Hit[] = [];
  const elsewhere: Hit[] = [];
  for (const path of paths) {
    const result = await scan(page, path);
    labels.push(...result.labels);
    elsewhere.push(...result.elsewhere);
  }
  for (const hit of elsewhere) {
    test.info().annotations.push({ type: "eligib* in other text (not a label)", description: `${hit.page} ${hit.element}: "${hit.text}"` });
  }
  const list = labels.map((h) => `${h.page} ${h.element}: "${h.text}"`).join("\n");
  expect(labels, `Our labels or headings say "eligible"/"eligibility":\n${list}`).toEqual([]);
}

test.describe("wording, signed out", () => {
  test("wording: no 'eligible' in labels or headings (start page, sign-in)", async ({ page }) => {
    await checkPages(page, ["/", "/sign-in"]);
  });
});

test.describe("wording, member", () => {
  test.use({ storageState: MEMBER_STATE });
  test("wording: no 'eligible' in labels or headings (member screens)", async ({ page }) => {
    await checkPages(page, [
      "/",
      "/week",
      "/profile",
      "/profile/embeddedart",
      "/explore",
      "/explore?view=timeline",
      "/scout",
      "/copilot",
      "/trust",
      "/sources",
    ]);
  });
});

test.describe("wording, staff", () => {
  test.use({ storageState: STAFF_STATE });
  test("wording: no 'eligible' in labels or headings (staff screens)", async ({ page }) => {
    await checkPages(page, [
      "/staff/compare?a=embeddedart&b=malvacom",
      "/staff/ecosystem",
      "/profile",
      "/profile/malvacom",
      "/staff/handoffs",
      "/staff/injection-demo",
      "/staff/checks",
      "/trust",
    ]);
  });
});
