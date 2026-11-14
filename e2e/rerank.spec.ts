import { existsSync } from "node:fs";
import { devices, type Browser, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";
import { expect, main, open, signInThroughForm, test } from "./helpers";

/**
 * C8 in a real browser: switching on "Testing and testbeds" on /profile
 * visibly reorders the Your-week cards, without a reload, and switching it off
 * brings the old order back.
 *
 * It changes real data (Techinova's priorities, its ranking and its cards), so
 * it runs only when E2E_RERANK=1 is set, and afterAll puts the priority back
 * through the page, also when the test fails. It needs the dev server and the
 * Inngest dev server (the chain: re-rank, judge the new rows, build the cards).
 *
 *   E2E_RERANK=1 node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test e2e/rerank.spec.ts
 */

const TECHINOVA = DEMO_ACCOUNTS.find((a) => a.email.startsWith("techinova@"))!;
/** Techinova's saved session, next to the suite's others in the git-ignored e2e/.auth/ folder. */
const TECHINOVA_STATE = "e2e/.auth/techinova.json";
const PRIORITY = "Testing and testbeds";
/** The chain takes about 8 seconds, plus up to one 30 s poll of an idle page; the brief allows 90. */
const CHAIN_TIMEOUT = 90_000;

test.skip(process.env.E2E_RERANK !== "1", "Changes Techinova's real data: set E2E_RERANK=1 to run it.");
test.describe.configure({ mode: "serial" });
test.use({ ...devices["Desktop Chrome"], storageState: TECHINOVA_STATE, reducedMotion: "no-preference" });

/** Recorded by the test before it changes anything; afterAll puts it back. */
let start: { keys: string[]; priorityOn: boolean } | null = null;

const note = (type: string, description: string) => {
  test.info().annotations.push({ type, description });
  console.log(`[${type}] ${description}`);
};

const numbered = (titles: string[]) => titles.map((t, i) => `${i + 1}. ${t}`).join(" | ");

/** The cards on /week in their order: the key that survives a rebuild, and the title. */
async function cardOrder(page: Page): Promise<{ keys: string[]; titles: string[] }> {
  return main(page)
    .locator("ol > li[data-key]")
    .evaluateAll((rows) => ({
      keys: rows.map((r) => (r as HTMLElement).dataset.key ?? ""),
      titles: rows.map((r) => (r.querySelector("h3")?.textContent ?? "").trim()),
    }));
}

/** The line above the list that says what changed (app/week/week-live.tsx). */
const statusLine = (page: Page) => main(page).locator("p[role='status']").first();

function priorityButton(page: Page) {
  return main(page).getByRole("group", { name: "Your priorities" }).getByRole("button", { name: PRIORITY, exact: true });
}

/** Press the switch through the real button and wait until the server saved it. */
async function switchPriority(page: Page, on: boolean) {
  const button = priorityButton(page);
  await expect(button).toHaveAttribute("aria-pressed", String(!on));
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", String(on));
  // aria-disabled is set while the server action runs; an error would show an alert.
  await expect(button).not.toHaveAttribute("aria-disabled", "true", { timeout: 30_000 });
  await expect(main(page).getByRole("alert")).toHaveCount(0);
}

type Watch = {
  /** Date.now() when watching started. */
  since: number;
  frames: number;
  /** Frames in which a card was offset by a transform (the FLIP move)... */
  movedFrames: number;
  /** ...or faded in (a new card). */
  fadedFrames: number;
  maxShiftPx: number;
  /** ms after `since` of the first and last frame with movement. */
  firstMoveMs: number | null;
  lastMoveMs: number | null;
  /** A few frames of the per-card offsets in px, to show them shrinking to 0. */
  series: string[];
  /** Each new text of the status line, with ms after `since`. */
  lines: string[];
  /** Visibility changes of this tab, with ms after `since`. */
  visibility: string[];
};

/**
 * Watches every animation frame of /week: card offsets and fades, the status
 * line and the tab's visibility. Kept on `window`, so finding it again also
 * proves the page was not reloaded.
 */
async function startWatching(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __rerankWatch?: Watch; __rerankLoop?: boolean; __rerankLine?: string };
    w.__rerankWatch = { since: Date.now(), frames: 0, movedFrames: 0, fadedFrames: 0, maxShiftPx: 0, firstMoveMs: null, lastMoveMs: null, series: [], lines: [], visibility: [] };
    if (w.__rerankLoop) return;
    w.__rerankLoop = true;
    document.addEventListener("visibilitychange", () => {
      const watch = w.__rerankWatch!;
      watch.visibility.push(`${Date.now() - watch.since} ms: ${document.visibilityState}`);
    });
    const tick = () => {
      const watch = w.__rerankWatch!;
      const at = Date.now() - watch.since;
      watch.frames++;
      const line = (document.querySelector("main#main p[role='status']")?.textContent ?? "").trim();
      if (line !== w.__rerankLine) {
        w.__rerankLine = line;
        watch.lines.push(`${at} ms: ${line || "(empty)"}`);
      }
      let moved = false;
      let faded = false;
      const shifts: string[] = [];
      for (const row of Array.from(document.querySelectorAll<HTMLElement>("main#main ol > li[data-key]"))) {
        const style = getComputedStyle(row);
        if (style.transform && style.transform !== "none") {
          const dy = new DOMMatrixReadOnly(style.transform).m42;
          if (Math.abs(dy) > 0.5) {
            moved = true;
            watch.maxShiftPx = Math.max(watch.maxShiftPx, Math.round(Math.abs(dy)));
          }
          shifts.push(String(Math.round(dy)));
        } else {
          shifts.push("0");
        }
        if (Number(style.opacity) < 0.99) faded = true;
      }
      if (moved || faded) {
        watch.firstMoveMs ??= at;
        watch.lastMoveMs = at;
        if (moved) watch.movedFrames++;
        if (faded) watch.fadedFrames++;
        if (watch.series.length < 8 && (watch.movedFrames + watch.fadedFrames) % 5 === 1) watch.series.push(`${at} ms [${shifts.join(",")}]`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readWatch(page: Page): Promise<Watch | null> {
  return page.evaluate(() => (window as unknown as { __rerankWatch?: Watch }).__rerankWatch ?? null);
}

/** Wait, without reloading, until `check` holds for the order of the cards; returns the ms it took. */
async function waitForOrder(page: Page, check: (keys: string[]) => boolean, what: string): Promise<number> {
  const t0 = Date.now();
  await expect
    .poll(async () => check((await cardOrder(page)).keys), {
      message: `the cards should be ${what} within ${CHAIN_TIMEOUT / 1000} s, without a reload`,
      timeout: CHAIN_TIMEOUT,
      intervals: [250],
    })
    .toBe(true);
  return Date.now() - t0;
}

const baseURL = () => test.info().project.use.baseURL ?? "http://localhost:3000";

/** Sign Techinova in through the real form and keep the session, as e2e/auth.setup.ts does for the others. */
async function signIn(browser: Browser) {
  const context = await browser.newContext({ baseURL: baseURL(), storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto("/sign-in");
    await signInThroughForm(page, TECHINOVA.email);
    await expect(page).toHaveURL(/\/week$/);
    await context.storageState({ path: TECHINOVA_STATE });
  } finally {
    await context.close();
  }
}

test.beforeAll(async ({ browser }) => {
  await signIn(browser);
});

test("switching on 'Testing and testbeds' visibly reorders the week, and switching it off brings the order back", async ({ page }) => {
  test.setTimeout(5 * 60_000);

  // 1. The starting order, and the data labels on the cards (D20).
  await open(page, "/week", "Your week");
  await expect(main(page).locator("ol > li[data-key]").first()).toBeVisible();
  const before = await cardOrder(page);
  const labels = await main(page).locator("[data-data-status]").allInnerTexts();
  note("data labels on the cards", labels.length ? labels.join("; ") : "none (every card read live)");
  note("order before", numbered(before.titles));

  // 2. /profile in a second tab; the switch must be off to start with.
  const profile = await page.context().newPage();
  await open(profile, "/profile", /.+/);
  const initiallyOn = (await priorityButton(profile).getAttribute("aria-pressed")) === "true";
  start = { keys: before.keys, priorityOn: initiallyOn };
  expect(initiallyOn, `"${PRIORITY}" is already on for Techinova; this test needs it off to start with`).toBe(false);

  await startWatching(page);
  const onAt = Date.now();
  await switchPriority(profile, true);
  note("switched on", `saved ${Date.now() - onAt} ms after the click`);

  // 3. Back on /week, no reload: a new order and the change line.
  await page.bringToFront();
  await waitForOrder(page, (keys) => keys.join("\n") !== before.keys.join("\n"), "in a new order");
  const reorderedMs = Date.now() - onAt;
  await expect(statusLine(page)).toHaveText(/^Re-ranked after your profile change:/, { timeout: 10_000 });
  await page.waitForTimeout(1_500); // the move takes 700 ms
  const watchOn = await readWatch(page);
  expect(watchOn, "the page was reloaded: the watcher on window is gone").not.toBeNull();
  note("order with Testing on", numbered((await cardOrder(page)).titles));
  note("status line (on)", (await statusLine(page).innerText()).trim());
  note("timing (on)", `new order seen ${reorderedMs} ms after the click`);
  note("watch (on)", JSON.stringify(watchOn));
  expect(watchOn!.movedFrames + watchOn!.fadedFrames, "the cards should slide to their new places or fade in").toBeGreaterThan(0);

  // 4. Switch it off again and wait for the starting order, still without a reload.
  await startWatching(page);
  await profile.bringToFront();
  const offAt = Date.now();
  await switchPriority(profile, false);
  note("switched off", `saved ${Date.now() - offAt} ms after the click`);
  await page.bringToFront();
  await waitForOrder(page, (keys) => keys.join("\n") === before.keys.join("\n"), "back in the starting order");
  const backMs = Date.now() - offAt;
  await page.waitForTimeout(1_500);
  const watchOff = await readWatch(page);
  expect(watchOff, "the page was reloaded: the watcher on window is gone").not.toBeNull();
  note("status line (off)", (await statusLine(page).innerText()).trim());
  note("timing (off)", `starting order seen ${backMs} ms after the click`);
  note("watch (off)", JSON.stringify(watchOff));
  await profile.close();
});

test.afterAll(async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  if (!start || !existsSync(TECHINOVA_STATE)) return; // nothing recorded, so nothing was changed
  const wanted = start;
  const context = await browser.newContext({ ...devices["Desktop Chrome"], baseURL: baseURL(), storageState: TECHINOVA_STATE });
  try {
    const page = await context.newPage();
    // Put the priority back through the page, also when the test stopped half way.
    await open(page, "/profile", /.+/);
    const on = (await priorityButton(page).getAttribute("aria-pressed")) === "true";
    if (on !== wanted.priorityOn) {
      note("afterAll", `"${PRIORITY}" was ${on ? "on" : "off"}: switching it back`);
      await switchPriority(page, wanted.priorityOn);
    }
    await page.reload();
    await expect(priorityButton(page), `"${PRIORITY}" should be ${wanted.priorityOn ? "on" : "off"} again`).toHaveAttribute(
      "aria-pressed",
      String(wanted.priorityOn),
    );

    // The cards in the starting order, read from the page.
    await expect
      .poll(
        async () => {
          await open(page, "/week", "Your week");
          return (await cardOrder(page)).keys.join("\n");
        },
        { message: "the cards should be back in the starting order", timeout: 3 * 60_000, intervals: [5_000] },
      )
      .toBe(wanted.keys.join("\n"));
    note("afterAll", `"${PRIORITY}" is ${wanted.priorityOn ? "on" : "off"} and the ${wanted.keys.length} cards are in the starting order`);
  } finally {
    await context.close();
  }
});
