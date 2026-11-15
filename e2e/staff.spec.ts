import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { checkHandEnteredLabels, expect, handEnteredSources, main, open, test } from "./helpers";

/**
 * The staff half of the demo path (step 9), signed in as the BSP staff demo
 * account. Read-only: nothing here writes data.
 */

const STAFF_MENU = ["Compare", "Ecosystem map", "Company profiles", "Handoffs", "Explore", "Injection test", "Trust report", "Service checks"];

function staffMenu(page: Page) {
  return page.getByRole("navigation", { name: "Staff menu" });
}

test("9a. the staff menu shows the staff items and no 'Your week'", async ({ page }) => {
  await open(page, "/staff/compare", "Compare members");
  await expect(staffMenu(page)).toBeVisible();
  const labels = (await staffMenu(page).getByRole("link").allInnerTexts()).map((l) => l.trim());
  expect(labels, "the staff menu, in order").toEqual(STAFF_MENU);
  await expect(page.getByRole("banner").getByText("BSP staff", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Member menu" })).toHaveCount(0);
});

test("9b. /staff/compare: EmbeddedArt and Malvacom give two different top fives", async ({ page }) => {
  await open(page, "/staff/compare", "Compare members");
  await main(page).getByLabel("First member").selectOption("embeddedart");
  await main(page).getByLabel("Second member").selectOption("malvacom");
  await main(page).getByRole("button", { name: "Compare" }).click();
  await expect(page).toHaveURL(/a=embeddedart/);
  await expect(page).toHaveURL(/b=malvacom/);

  const sides = main(page).locator('.grid > [data-slot="card"]');
  await expect(sides, "two member cards side by side").toHaveCount(2);
  const names = (await sides.locator('[data-slot="card-title"]').allInnerTexts()).map((n) => n.trim());
  expect(names.map((n) => n.toLowerCase())).toEqual([expect.stringContaining("embeddedart"), expect.stringContaining("malvacom")]);

  const tops: string[][] = [];
  const whyStates: string[] = [];
  for (let i = 0; i < 2; i++) {
    const side = sides.nth(i);
    const description = (await side.locator('[data-slot="card-description"]').innerText()).trim();
    const titles = (await side.locator("ol > li a").allInnerTexts()).map((t) => t.trim());
    tops.push(titles);
    const notJudged = await side.getByText("Not judged yet, so there is no reason written down.").count();
    whyStates.push(`${names[i]}: ${titles.length} items, ${titles.length - notJudged} with a why text, ${notJudged} "Not judged yet" (${description})`);
  }
  test.info().annotations.push({ type: "top fives", description: whyStates.join(" | ") });
  expect(tops[0].length, `${names[0]} should have a top five: ${whyStates[0]}`).toBeGreaterThan(0);
  expect(tops[1].length, `${names[1]} should have a top five: ${whyStates[1]}`).toBeGreaterThan(0);
  expect(tops[0], "the two top fives should differ").not.toEqual(tops[1]);
});

test("9c. /staff/ecosystem: clicking a connection shows its stated basis and the disclaimer", async ({ page }) => {
  await open(page, "/staff/ecosystem", "Ecosystem map");
  const graph = main(page).getByRole("group", { name: /^Graph of \d+ members linked by \d+ possible collaborations$/ });
  await expect(graph).toBeVisible();
  const line = graph.getByRole("button").first();
  await expect(line, "the graph should have at least one connection line").toBeVisible();
  const pair = (await line.getAttribute("aria-label")) ?? "";
  await line.click();
  await expect(line).toHaveAttribute("aria-pressed", "true");

  const detail = main(page).locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Stated basis" }) });
  await expect(detail, `clicking "${pair}" should open its detail`).toBeVisible();
  await expect(detail.locator('[data-slot="card-title"]')).toHaveText(pair);
  const basis = detail.getByRole("heading", { name: "Stated basis" }).locator("xpath=following-sibling::p");
  expect((await basis.innerText()).trim().length, "the stated basis should have text").toBeGreaterThan(10);
  await expect(detail.getByText("Neither company has expressed interest", { exact: false })).toBeVisible();
  test.info().annotations.push({ type: "pair", description: `${pair}: ${(await basis.innerText()).trim().slice(0, 200)}` });
});

test("9d. /profile for staff lists the companies and opens a public profile", async ({ page }) => {
  await open(page, "/profile", "Company profiles");
  const links = main(page).getByRole("listitem").getByRole("link");
  await expect(links.first()).toBeVisible();
  const count = await links.count();
  const link = main(page).getByRole("link", { name: "EmbeddedArt", exact: true });
  await expect(link, "EmbeddedArt should be in the list").toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/profile\/embeddedart$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/EmbeddedArt/);
  await expect(main(page).getByRole("heading", { level: 2, name: "Public profile" })).toBeVisible();
  const fields = await main(page).locator('ol > li [data-slot="card"]').count();
  expect(fields, "the public profile should show its fields").toBe(8);
  await expect(main(page).getByRole("link", { name: "All company profiles" })).toBeVisible();
  test.info().annotations.push({ type: "companies", description: `${count} companies in the list` });
});

test("9e. /staff/handoffs and /staff/injection-demo open", async ({ page }) => {
  await open(page, "/staff/handoffs", "Handoffs");
  await expect(main(page).getByText(/Loading/)).toHaveCount(0);
  const handoffText = (await main(page).innerText()).replace(/\s+/g, " ");
  test.info().annotations.push({ type: "handoffs", description: handoffText.slice(0, 200) });

  await open(page, "/staff/injection-demo", "Planted instruction test");
  await expect(main(page).getByText(/Loading the last run/)).toHaveCount(0);
  const injectionText = (await main(page).innerText()).replace(/\s+/g, " ");
  expect(injectionText, "the injection demo should show a recorded run").not.toContain("No run recorded yet");
});

test("9g. the 'Company profiles' and 'Injection test' menu items open their screens", async ({ page }) => {
  await open(page, "/staff/compare", "Compare members");
  for (const [item, path, heading] of [
    ["Company profiles", /\/profile$/, "Company profiles"],
    ["Injection test", /\/staff\/injection-demo$/, "Planted instruction test"],
  ] as const) {
    const link = staffMenu(page).getByRole("link", { name: item, exact: true });
    await expect(link, `the staff menu should have "${item}"`).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1, name: heading }), `"${item}" should open "${heading}"`).toBeVisible();
    await expect(staffMenu(page).getByRole("link", { name: item, exact: true }), "the menu marks the open screen").toHaveAttribute("aria-current", "page");
  }
});

test("9h. /trust: the red-team table shows group display names, not raw ids", async ({ page }) => {
  const prompts = JSON.parse(readFileSync("eval/redteam-prompts.json", "utf8")) as { groups: { id: string }[] };
  const ids = prompts.groups.map((g) => g.id);
  await open(page, "/trust", "Trust report");
  const section = main(page).locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { level: 2, name: "Red-team tests" }) });
  await expect(section, "the Red-team tests section").toHaveCount(1);
  const labels = (await section.locator("tbody tr > :first-child").allInnerTexts()).map((t) => t.trim());
  test.info().annotations.push({ type: "groups", description: labels.join("; ") });
  expect(labels.length, "the red-team run should be measured (one row per group)").toBeGreaterThan(0);
  const raw = labels.filter((l) => ids.includes(l) || /^[a-z]+(_[a-z]+)*$/.test(l));
  expect(raw, `rows labelled with a raw group id (ids: ${ids.join(", ")}):\n${raw.join("\n")}`).toEqual([]);
});

test("9i. data labels: hand-entered items on /staff/compare say 'Hand-entered', not 'Simulated'", async ({ page }) => {
  const sources = await handEnteredSources(page);
  await open(page, "/staff/compare?a=embeddedart&b=malvacom", "Compare members");
  const sides = main(page).locator('.grid > [data-slot="card"]');
  await expect(sides).toHaveCount(2);
  const rows = sides.locator("ol > li");
  await expect(rows.first()).toBeVisible();
  const { problems, seen, handEntered, total } = await checkHandEnteredLabels(rows, sources, "/staff/compare");
  test.info().annotations.push({
    type: "labels",
    description: handEntered
      ? `${handEntered} of ${total} items in the two top fives are hand-entered: ${JSON.stringify(seen)}`
      : `none of the ${total} items in the two top fives is hand-entered, so the label could not be seen`,
  });
  expect(problems, problems.join("\n")).toEqual([]);
});

test("9f. /week is not offered to staff", async ({ page }) => {
  await open(page, "/staff/compare", "Compare members");
  await expect(staffMenu(page).getByRole("link", { name: "Your week" })).toHaveCount(0);
  await page.goto("/week");
  const path = new URL(page.url()).pathname;
  expect(path, `staff asking for /week ended on ${path}`).not.toBe("/week");
  expect(path, "the proxy sends staff to their home").toBe("/staff/compare");
});
