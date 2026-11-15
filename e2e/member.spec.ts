import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { OUT_OF_SCOPE_REPLY } from "../lib/copilot/policy";
import { DATE_TEXT, MEMBER, expect, main, open, signInThroughForm, test } from "./helpers";

/**
 * The member half of the demo path (steps 1 to 8), signed in as the
 * EmbeddedArt demo account. Each test opens its own page, so one broken screen
 * does not hide the others.
 *
 * The run shares the hosted database with other people, so it leaves nothing
 * behind: Save is pressed only on an unsaved card and pressed again to undo
 * it. Useful / Not relevant (re-ranks real data), Ask BSP and "Send to BSP
 * staff" (handoffs with no undo), the profile editor's Save, the priority
 * switches, "Ask Scout" and "Sign out" (ends the account's sessions
 * everywhere) are never pressed.
 */

const STATUS_BADGES = ["Stated", "Inferred", "Missing", "Confirmed by member", "Corrected by member"];
const PROFILE_FIELDS = [
  "Summary",
  "Products and services",
  "Technologies",
  "Application areas",
  "Markets",
  "Geography",
  "Projects and priorities",
  "Likely interests",
];

/** The cards on /week, in order. */
function weekCards(page: Page): Locator {
  return main(page).locator('ol > li [data-slot="card"]');
}

/** One "Your week" card: its badges and the headings of its parts. */
async function describeCard(card: Locator) {
  const text = await card.innerText();
  const title = (await card.locator("h3").first().innerText().catch(() => "(no title)")).trim();
  const parts = (await card.locator("h4").allInnerTexts()).map((h) => h.trim().toLowerCase());
  const sourceLinks = await card.locator('[data-slot="card-content"] a[href^="http"]').count();
  return { text, title, parts, sourceLinks };
}

/** "All 120 opportunities" or "12 of 120 opportunities" on /explore. */
async function exploreCount(page: Page): Promise<{ shown: number; total: number; text: string }> {
  const line = main(page).getByText(/^(All \d+ opportunities|\d+ of \d+ opportunities)/);
  await expect(line).toBeVisible();
  const text = (await line.innerText()).trim();
  const all = text.match(/^All (\d+) opportunities/);
  if (all) return { shown: Number(all[1]), total: Number(all[1]), text };
  const some = text.match(/^(\d+) of (\d+) opportunities/)!;
  return { shown: Number(some[1]), total: Number(some[2]), text };
}

test.describe("1. start page, sign in, Your week", () => {
  // A fresh browser: this step signs in through the real form itself.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("1. start page -> sign in -> /week with complete cards and a trend card", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("opportunities");
    // The start page's "Sign in" is a link styled as a button; Base UI gives it role="button".
    await main(page).getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await signInThroughForm(page, MEMBER.email);
    await expect(page, "a member should land on /week after signing in").toHaveURL(/\/week$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your week" })).toBeVisible();

    const cards = weekCards(page);
    await expect(cards.first(), "Your week should show at least one card").toBeVisible();
    const count = await cards.count();

    const problems: string[] = [];
    let matches = 0;
    let trends = 0;
    for (let i = 0; i < count; i++) {
      const { text, title, parts, sourceLinks } = await describeCard(cards.nth(i));
      const where = `card ${i + 1} "${title}"`;
      if (/Trend note/.test(text)) {
        trends++;
        if (!parts.includes("what changed this week")) problems.push(`${where}: trend card has no "What changed this week" part`);
        if (!parts.includes("next step")) problems.push(`${where}: trend card has no "Next step" part`);
        continue;
      }
      matches++;
      if (!/Potential match/.test(text)) problems.push(`${where}: no "Potential match" label`);
      if (!parts.includes("why it fits")) problems.push(`${where}: no "Why it fits" part`);
      if (!parts.includes("next step")) problems.push(`${where}: no "Next step" part`);
      if (!parts.includes("what is uncertain")) problems.push(`${where}: no "What is uncertain" part`);
      if (sourceLinks < 1) problems.push(`${where}: no source link in the card body`);
    }

    test.info().annotations.push({ type: "cards", description: `${count} cards: ${matches} matches, ${trends} trend notes` });
    expect(problems, `Problems on /week (${count} cards):\n${problems.join("\n")}`).toEqual([]);
    expect(matches, "at least one match card").toBeGreaterThan(0);
    expect(trends, "a trend card should be present on /week").toBeGreaterThan(0);
  });
});

test.describe("2. card actions on /week", () => {
  test("2a. Save then unsave a card (the saved state survives a reload)", async ({ page }) => {
    await open(page, "/week", "Your week");
    // Only a card that is not saved yet: saving and unsaving it leaves the data as it was.
    const groups = main(page).getByRole("group", { name: /^Actions for / });
    await expect(groups.first(), "match cards should have their action buttons").toBeVisible();
    const unsaved = groups.filter({ has: page.getByRole("button", { name: "Save", exact: true, pressed: false }) });
    if (!(await unsaved.count())) {
      test.info().annotations.push({ type: "not exercised", description: "every card was already saved, so Save was not pressed" });
      test.skip(true, "every card on /week is already saved; pressing Save would change real data");
    }
    const groupName = (await unsaved.first().getAttribute("aria-label")) ?? "";
    test.info().annotations.push({ type: "card", description: groupName });
    const card = main(page).getByRole("group", { name: groupName, exact: true });
    const status = card.locator("xpath=..").locator('p[aria-live="polite"]');

    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByRole("button", { name: "Saved", exact: true }), "the button should turn into Saved").toHaveAttribute("aria-pressed", "true");
    await expect(status).toHaveText("Saved for your company.");

    await page.reload();
    await expect(
      main(page).getByRole("group", { name: groupName, exact: true }).getByRole("button", { name: "Saved", exact: true }),
      "after a reload the card should still be saved",
    ).toBeVisible();

    // Undo: unsave, and check that it stays unsaved.
    const again = main(page).getByRole("group", { name: groupName, exact: true });
    await again.getByRole("button", { name: "Saved", exact: true }).click();
    await expect(again.getByRole("button", { name: "Save", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(again.locator("xpath=..").locator('p[aria-live="polite"]')).toHaveText("Removed from saved.");
    await page.reload();
    await expect(
      main(page).getByRole("group", { name: groupName, exact: true }).getByRole("button", { name: "Save", exact: true }),
      "after the undo and a reload the card should be unsaved again",
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("2b. Add to calendar downloads an .ics file", async ({ page }) => {
    await open(page, "/week", "Your week");
    const link = main(page).getByRole("button", { name: "Add to calendar" }).first();
    await expect(link, "at least one card should offer Add to calendar").toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const name = download.suggestedFilename();
    expect(name, `the download should be an .ics file, got "${name}"`).toMatch(/\.ics$/);
    const path = await download.path();
    const body = readFileSync(path, "utf8");
    expect(body.startsWith("BEGIN:VCALENDAR"), `the file should start with BEGIN:VCALENDAR, got "${body.slice(0, 60)}"`).toBe(true);
    expect(body).toContain("BEGIN:VEVENT");
    test.info().annotations.push({ type: "ics", description: name });
  });
});

test.describe("3. company profile", () => {
  test("3a. all eight fields with a Stated / Inferred / Missing badge", async ({ page }) => {
    await open(page, "/profile", /.+/);
    await expect(main(page).getByRole("heading", { level: 2, name: "Profile", exact: true })).toBeVisible();
    const fields = main(page).locator('ol > li [data-slot="card"]');
    const titles = (await fields.locator('[data-slot="card-title"]').allInnerTexts()).map((t) => t.trim());
    expect(titles, "the eight profile fields, in order").toEqual(PROFILE_FIELDS);

    const found: string[] = [];
    const problems: string[] = [];
    for (let i = 0; i < titles.length; i++) {
      const badges = (await fields.nth(i).locator('[data-slot="badge"]').allInnerTexts()).map((b) => b.trim());
      const status = badges.find((b) => STATUS_BADGES.includes(b));
      if (!status) problems.push(`${titles[i]}: no status badge (badges: ${JSON.stringify(badges)})`);
      found.push(`${titles[i]}: ${status ?? "none"}`);
    }
    test.info().annotations.push({ type: "badges", description: found.join("; ") });
    expect(problems, problems.join("\n")).toEqual([]);
    const statuses = new Set(found.map((f) => f.split(": ")[1]));
    expect([...statuses].filter((s) => ["Stated", "Inferred", "Missing"].includes(s)).length, `badges seen: ${found.join("; ")}`).toBeGreaterThan(0);
  });

  test("3b. the evidence of a claim shows the highlighted quote and its source link", async ({ page }) => {
    await open(page, "/profile", /.+/);
    const evidence = main(page).locator("details").filter({ has: page.locator("summary", { hasText: /^Evidence: \d+ quotes?$/ }) }).first();
    await expect(evidence, "at least one field should have evidence").toBeVisible();
    await evidence.locator("summary").click();
    await expect(evidence).toHaveAttribute("open", "");
    const quote = evidence.locator("blockquote mark").first();
    await expect(quote, "the quote should be highlighted").toBeVisible();
    expect((await quote.innerText()).trim().length, "the highlighted quote should have text").toBeGreaterThan(3);
    const source = evidence.getByRole("link").first();
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute("href", /^https?:\/\//);
    await expect(evidence.getByText(/Retrieved /).first()).toBeVisible();
  });

  test("3c. the editor opens and Cancel closes it without saving", async ({ page }) => {
    await open(page, "/profile", /.+/);
    const field = main(page).locator('ol > li [data-slot="card"]').filter({ hasText: "Technologies" }).first();
    const before = await field.locator('[data-slot="card-content"]').innerText();
    // "Edit" or "Edit Technologies" (the button may name its field).
    const edit = field.getByRole("button", { name: /^(Edit|Add)\b/ });
    await edit.click();
    const box = field.getByRole("textbox");
    await expect(box, "the editor should show a text box").toBeVisible();
    await expect(field.getByRole("button", { name: /^Save\b/ })).toBeVisible();
    await field.getByRole("button", { name: /^Cancel\b/ }).click();
    await expect(box).toBeHidden();
    await expect(edit).toBeVisible();
    expect(await field.locator('[data-slot="card-content"]').innerText(), "the field should be unchanged after Cancel").toBe(before);
  });

  test("3d. the priority switches are present (not toggled)", async ({ page }) => {
    await open(page, "/profile", /.+/);
    await expect(main(page).getByRole("heading", { name: "Your priorities" })).toBeVisible();
    const switches = main(page).getByRole("group", { name: "Priorities" }).getByRole("button");
    await expect(switches.first()).toBeVisible();
    const labels = await switches.allInnerTexts();
    for (const label of labels) expect(label.trim(), "each switch says On: or Off:").toMatch(/^(On|Off):\s+\S/);
    for (const s of await switches.all()) await expect(s).toHaveAttribute("aria-pressed", /^(true|false)$/);
    test.info().annotations.push({ type: "switches", description: labels.map((l) => l.replace(/\s+/g, " ").trim()).join("; ") });
  });
});

test.describe("4. explore", () => {
  test("4a. filtering by kind changes the result count", async ({ page }) => {
    await open(page, "/explore", "Explore");
    const all = await exploreCount(page);
    expect(all.shown, `before filtering: "${all.text}"`).toBe(all.total);

    // Which "why" state the member's matches are in right now (judgements are being regenerated).
    const notes = main(page).getByText(/^Potential match for you, number \d+/);
    const notJudged = await main(page).getByText("Not judged yet, so there is no reason written down.").count();
    test.info().annotations.push({ type: "why texts", description: `${await notes.count()} match notes, ${notJudged} of them "Not judged yet"` });

    await main(page).getByLabel("Kind").selectOption({ label: "Funding call" });
    await main(page).getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/kind=funding/);
    await expect(main(page).getByText(/^\d+ of \d+ opportunities/)).toBeVisible();
    const funding = await exploreCount(page);
    expect(funding.shown, `after Kind = Funding call: "${funding.text}"`).toBeLessThan(all.total);
    expect(funding.shown).toBeGreaterThan(0);
    const kinds = await main(page).locator("li[data-kind]").evaluateAll((rows) => [...new Set(rows.map((r) => r.getAttribute("data-kind")))]);
    expect(kinds, "every row should be a funding call").toEqual(["funding"]);
  });

  test("4b. filtering by deadline changes the result count", async ({ page }) => {
    await open(page, "/explore", "Explore");
    const all = await exploreCount(page);
    await main(page).getByLabel("Deadline").selectOption({ label: "Open now" });
    await main(page).getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/due=open/);
    await expect(main(page).getByText(/^(\d+ of \d+ opportunities)/)).toBeVisible();
    const open_ = await exploreCount(page);
    expect(open_.shown, `after Deadline = Open now: "${open_.text}" (before: "${all.text}")`).toBeLessThan(all.total);

    await main(page).getByLabel("Deadline").selectOption({ label: "Closing within 30 days" });
    await main(page).getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/due=soon/);
    const soon = await exploreCount(page);
    test.info().annotations.push({ type: "counts", description: `all ${all.total}; open now ${open_.shown}; closing within 30 days ${soon.shown}` });
    expect(soon.shown, `after Deadline = Closing within 30 days: "${soon.text}"`).toBeLessThan(all.total);
  });

  test("4c. the deadline timeline view opens", async ({ page }) => {
    await open(page, "/explore", "Explore");
    await main(page).getByRole("navigation", { name: "View" }).getByRole("link", { name: "Deadline timeline" }).click();
    await expect(page).toHaveURL(/view=timeline/);
    await expect(main(page).getByRole("heading", { name: "Funding call deadlines" })).toBeVisible();
    await expect(main(page).getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Deadline timeline" })).toHaveAttribute("aria-current", "page");
    const months = await main(page).getByRole("list", { name: "Deadlines per month" }).getByRole("listitem").count();
    test.info().annotations.push({ type: "timeline", description: `${months} months in the deadline bar chart` });
  });
});

test("5. Scout: the stored brief for the demo question opens with cited options", async ({ page }) => {
  const prerun = JSON.parse(readFileSync("data/scout-briefs/embeddedart.json", "utf8")) as { question: string };
  await open(page, "/scout", "Scout");
  const list = main(page).locator("aside");
  await expect(list.getByRole("heading", { name: "Your briefs" })).toBeVisible();
  const entry = list.getByRole("button").filter({ hasText: prerun.question }).first();
  if (!(await entry.count())) {
    const available = await list.getByRole("button").allInnerTexts();
    throw new Error(`No stored brief for "${prerun.question}" in "Your briefs". The list has: ${JSON.stringify(available)}`);
  }
  // Opening a stored brief only reads it (GET /api/scout/<id>); "Ask Scout" is never pressed.
  await entry.click();
  await expect(entry).toHaveAttribute("aria-current", "true");
  const brief = main(page).locator("article");
  await expect(brief.getByRole("heading", { level: 2 })).toHaveText(prerun.question);
  await expect(brief.getByText("Done", { exact: true }).first()).toBeVisible();
  const options = brief.locator('ol > li [data-slot="card"]');
  await expect(options.first(), "the brief should list options").toBeVisible();
  const count = await options.count();
  const problems: string[] = [];
  for (let i = 0; i < count; i++) {
    const option = options.nth(i);
    const title = (await option.locator('[data-slot="card-title"]').innerText()).trim();
    const footer = option.locator('[data-slot="card-footer"]');
    if (!(await footer.getByText(/^Source:/).count())) problems.push(`option "${title}": no "Source:" line`);
    const href = await footer.getByRole("link").first().getAttribute("href").catch(() => null);
    if (!href || !/^https?:\/\//.test(href)) problems.push(`option "${title}": source link is ${JSON.stringify(href)}`);
    if (!(await option.getByText("Potential match", { exact: true }).count())) problems.push(`option "${title}": no "Potential match" label`);
  }
  test.info().annotations.push({ type: "brief", description: `${count} options` });
  expect(problems, problems.join("\n")).toEqual([]);
});

test.describe("6. Copilot", () => {
  // The model is Claude (rate limited per key): one question per test, one retry after a "busy" reply.
  test.describe.configure({ timeout: 150_000 });
  // Each question stores a chat turn for the company, and the app has no way to delete one.
  test.skip(!!process.env.E2E_SKIP_COPILOT, "E2E_SKIP_COPILOT is set: the Copilot questions are not asked");

  /** Ask one question and wait for the answer bubble (or an error line). Retries once after "busy". */
  async function ask(page: Page, question: string): Promise<{ chip: string; text: string; bubble: Locator }> {
    const panel = main(page).getByRole("region", { name: "Copilot" });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const before = await panel.getByTestId("scope-chip").count();
      const errorsBefore = await panel.locator("p.text-destructive").count();
      await panel.getByRole("textbox", { name: "Your question" }).fill(question);
      await panel.getByRole("button", { name: "Ask" }).click();
      // Up to 30 s for the model, as the brief allows.
      await expect(async () => {
        const chips = await panel.getByTestId("scope-chip").count();
        const errors = await panel.locator("p.text-destructive").count();
        expect(chips > before || errors > errorsBefore, "waiting for an answer").toBe(true);
      }).toPass({ timeout: 30_000 });
      const errors = panel.locator("p.text-destructive");
      if ((await errors.count()) > errorsBefore) throw new Error(`The Copilot showed an error: "${await errors.last().innerText()}"`);
      const bubble = panel.getByTestId("scope-chip").last().locator("xpath=../..");
      const text = (await bubble.locator("p").first().innerText()).trim();
      const chip = (await panel.getByTestId("scope-chip").last().innerText()).trim();
      if (/busy right now/i.test(text) && attempt === 1) {
        test.info().annotations.push({ type: "retry", description: `"busy" reply to "${question}", asked again once` });
        continue;
      }
      return { chip, text, bubble };
    }
    throw new Error("unreachable");
  }

  test.beforeEach(async ({ request }) => {
    // Compile the chat route before the timed question (a GET does nothing else).
    await request.get("/api/chat").catch(() => null);
  });

  test("6a. a relevant question gets an answer with citations and an In scope chip", async ({ page }) => {
    await open(page, "/copilot", "Copilot");
    const { chip, text, bubble } = await ask(page, "Which test facilities could we use for an underwater sensor?");
    test.info().annotations.push({ type: "answer", description: `[${chip}] ${text.slice(0, 300)}` });
    expect(chip, `scope chip; answer was: "${text.slice(0, 300)}"`).toBe("In scope");
    expect(text.length).toBeGreaterThan(20);
    expect(text, "a relevant question must not get the fixed out-of-scope reply").not.toBe(OUT_OF_SCOPE_REPLY);
    const sources = bubble.getByText("Sources", { exact: true });
    await expect(sources, `the answer should list its sources; answer was: "${text.slice(0, 300)}"`).toBeVisible();
    const links = bubble.locator("ol li a[href]");
    expect(await links.count(), "at least one cited source link").toBeGreaterThan(0);
    expect(text, "the answer text should cite with [n]").toMatch(/\[\d+\]/);
    // The question must not have created a handoff (that has no undo).
    await expect(bubble.getByText("Sent to BSP staff")).toHaveCount(0);
  });

  test("6b. 'What is the capital of Australia?' gets the fixed out-of-scope reply", async ({ page }) => {
    await open(page, "/copilot", "Copilot");
    const { chip, text } = await ask(page, "What is the capital of Australia?");
    expect(chip).toBe("Out of scope");
    expect(text).toBe(OUT_OF_SCOPE_REPLY);
  });
});

test.describe("7. trust report and data status", () => {
  /** Each named Trust-report section must show numbers (a table) and a date, not "not measured yet". */
  async function checkTrustSections(page: Page, titles: string[]) {
    await open(page, "/trust", "Trust report");
    const problems: string[] = [];
    const seen: string[] = [];
    for (const title of titles) {
      const card = main(page).locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: new RegExp(`^${title}$`) }) });
      // The sections stream in after the heading, so wait for each one.
      try {
        await expect(card).toHaveCount(1);
      } catch {
        problems.push(`${title}: section not found (${await card.count()} matches)`);
        continue;
      }
      const text = await card.innerText();
      if (/not measured yet/i.test(text)) problems.push(`${title}: says "not measured yet"`);
      const rows = await card.locator("tbody tr").count();
      if (rows < 1) problems.push(`${title}: no table rows (numbers)`);
      const date = text.match(DATE_TEXT)?.[0];
      if (!date) problems.push(`${title}: no date`);
      seen.push(`${title}: ${rows} rows, date ${date ?? "none"}`);
    }
    test.info().annotations.push({ type: "sections", description: seen.join("; ") });
    return problems;
  }

  test("7a. /trust shows quote check, link health and source status with dates", async ({ page }) => {
    const problems = await checkTrustSections(page, ["Quote check", "Link health", "Source status"]);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  // Separate from 7a: the matching numbers depend on the judgements, which may be regenerating.
  test("7c. /trust shows the matching numbers with a date", async ({ page }) => {
    const problems = await checkTrustSections(page, ["Matching"]);
    expect(
      problems,
      `${problems.join("\n")}\n(While the matcher's judgements are being regenerated the member's matches have no judge date, so "not measured yet" is expected then; re-run afterwards.)`,
    ).toEqual([]);
  });

  test("7b. /sources: every source has a status", async ({ page }) => {
    await open(page, "/sources", "Data status");
    const rows = main(page).locator("li[data-source]");
    await expect(rows.first(), "at least one source").toBeVisible();
    const count = await rows.count();
    const missing: string[] = [];
    const statuses: string[] = [];
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const source = await row.getAttribute("data-source");
      const label = row.locator("[data-data-status]");
      if (!(await label.count())) missing.push(source ?? `row ${i + 1}`);
      else statuses.push(`${source}: ${(await label.innerText()).trim()}`);
    }
    test.info().annotations.push({ type: "sources", description: `${count} sources. ${statuses.join("; ")}` });
    expect(missing, `sources without a status: ${missing.join(", ")}`).toEqual([]);
  });
});

test("8. a member opening /staff/compare is refused", async ({ page }) => {
  const response = await page.goto("/staff/compare");
  const path = new URL(page.url()).pathname;
  expect(path, `a member asking for /staff/compare ended on ${path} (HTTP ${response?.status()})`).not.toMatch(/^\/staff/);
  await expect(page.getByRole("heading", { name: "Compare members" })).toHaveCount(0);
  expect(path, "the proxy sends a member to their home, /week").toBe("/week");
});
