# Automated demo run (D13): results

A real browser walk-through of every screen, signed in through the real
sign-in form. Chromium (Playwright 1.64.1), against the local dev server at
http://localhost:3000. Two runs so far, both on 14 Nov 2026: the second one
(below) widens the suite to what was added after the first.

## Second run: 14 Nov 2026, 22:19 to 22:46 UTC

Run with `E2E_SKIP_COPILOT=1` while three other people were editing the
screens (the Swedish language switch, /explore, /week, /trust) and the match
judgements were being regenerated.

- **Baseline** (22:19 UTC, the suite as the first run left it): **30 passed,
  0 failed, 2 skipped** (the two Copilot questions). The first run's wording
  finding is gone: /trust now labels the red-team group `eligibility` as
  '"Can we apply?" questions' (test 9h checks it from now on).
- **Widened suite** (22:39 to 22:44 UTC, 79 tests): **75 passed, 2 failed,
  2 skipped**. Both failures were transient and passed when re-run at
  22:45 UTC, so the result is **77 passed, 0 failed, 2 skipped**. See
  "Transient failures".

### Steps (second run)

New tests are marked *new*.

| Step | Result | What the run saw |
| --- | --- | --- |
| setup: sign in as member and as staff through the form | PASS | member lands on /week, staff on /staff/compare |
| 1. Start page -> Sign in -> /week with cards | PASS | 7 cards: 6 matches, 1 trend note, all parts and source links present |
| 2a. Save, then unsave | PASS | "FMV Naval Test Ranges (Naval Test Centre, Karlskrona)": saved, still saved after a reload, unsaved, still unsaved after a reload |
| 2b. Add to calendar | PASS | `the-baltic-marine-watchdog-challenge.ics`, BEGIN:VCALENDAR with a VEVENT |
| 3a to 3d. /profile | PASS | six fields Stated, Projects and priorities Missing, Likely interests Corrected by member; evidence quote highlighted with its source; editor opens and Cancel leaves the field unchanged; switches read, not toggled (On: Testing and testbeds) |
| 4a. /explore: filter by kind | PASS | the "Filter" button is now found by its exact name (it no longer can match "Clear") |
| 4b. /explore: filter by deadline | PASS | All 190; Open now 65; Closing within 30 days 18 |
| 4c. /explore: timeline view | PASS | 20 months in the bar chart |
| 4d. /explore: map view (*new*) | PASS | 11 pins, each a `<button>` in the Tab order, named after its facility; the map's name ("... with 11 test facilities") matches. Clicking the first pin shows "STRI high-voltage laboratory, Ludvika"; Enter on the focused last pin shows its card and keeps focus on the pin. "Show it in the list" opens `/explore?kind=testbed#opportunity-...` scrolled to that row. The row is not highlighted: finding 2 |
| 5. /scout: stored brief | PASS | 8 options, each with "Potential match" and a source link |
| 6a, 6b. /copilot questions | SKIPPED | `E2E_SKIP_COPILOT=1`, as asked |
| 7a, 7c. /trust sections | PASS | Quote check 3 rows, Link health 1, Source status 9, Matching 2, each dated 14 Nov 2026 |
| 7b. /sources | PASS | 9 sources: 6 "Live · read 14 Nov 2026"; bsp_events, regional, testbeds "Hand-entered" |
| 8. Member opens /staff/compare | PASS | sent to /week |
| 10. Data labels on /explore and /week (*new*) | PASS (re-run; transient FAIL in the full run) | Hand-entered sources per /sources: "BSP and MTC event series", "Regional funding (hand-entered)", "Curated testbed list". /explore: 24 of 190 items come from them, all labelled "Hand-entered"; no "Simulated" label anywhere. /week: 3 of 6 match cards come from them, all labelled "Hand-entered": the **new wording** is shown (the old "Simulated data" badge is gone) |
| 9a. Staff menu | PASS | the eight staff items in order; no member menu |
| 9b. /staff/compare EmbeddedArt vs Malvacom | PASS | two different top fives of 5 |
| 9c. /staff/ecosystem | PASS | "Techinova and NKT": stated basis and the disclaimer |
| 9d. /profile as staff | PASS | 56 companies; EmbeddedArt's public profile has 8 fields |
| 9e. /staff/handoffs, /staff/injection-demo | PASS | both open; a recorded injection run is shown |
| 9f. /week not offered to staff | PASS | redirected to /staff/compare |
| 9g. "Company profiles" and "Injection test" menu items (*new*) | PASS | "Company profiles" opens /profile ("Company profiles"), "Injection test" opens /staff/injection-demo ("Planted instruction test"); each is then marked `aria-current="page"` |
| 9h. /trust red-team table names (*new*) | PASS | Relevant questions; Unrelated questions; Override attempts; Hidden instructions in sources; Other companies' data; "Can we apply?" questions. None is a raw id from `eval/redteam-prompts.json` |
| 9i. Data labels on /staff/compare (*new*) | PASS | 3 of the 10 items in the two top fives are hand-entered, all labelled "Hand-entered" |
| Phone (375 px): /week, /profile, /explore | PASS | no sideways scroll |
| Phone: /explore?view=timeline (*new*) | PASS | no sideways scroll: the 433 px overflow fixed today stays fixed |
| Phone: /explore?view=map, /scout, /copilot, /trust, /sources, /profile/malvacom (*new*) | PASS | no sideways scroll on any |
| Phone, staff: /staff/compare?a=embeddedart&b=malvacom, /staff/ecosystem (*new*) | PASS | no sideways scroll |
| Phone: Menu button | PASS | |
| Wording: signed out, member, staff | PASS (member: re-run; transient FAIL in the full run) | no "eligible" in our labels or headings |
| 10a. Copilot side sheet on a member page (*new*) | PASS | on /week the "Copilot" launcher opens a dialog named "Copilot"; focus is in "Your question"; Escape closes it and focus returns to the launcher. No question is sent |
| 10b. No launcher on /copilot (*new*) | PASS | absent when /copilot is loaded directly; present on /explore and gone after following the menu link to /copilot |
| 10c. No launcher for staff (*new*) | PASS | absent on /staff/compare and /explore |
| 10d. No launcher when signed out (*new*) | PASS | absent on / and /sign-in |
| 11a, 11c. Unknown address (*new*) | PASS | `/no-such-page-e2e` (member and signed out): HTTP 404, one h1 "Page not found", tab title "Page not found · ...", "Go to the start page" links to / |
| 11b. /profile/no-such-company (*new*) | PASS | one h1 "No company with this address", "Go to Company profile" links to /profile. HTTP 200 with a noindex tag (observation 4) |
| 12. Language switch (*new*) | PASS | the header has "English / Svenska". Svenska: the member menu becomes "Er vecka, Företagsprofil, Utforska, Scout, Copilot, Förtroenderapport" (from messages/sv.json), `<html lang="sv">`, cookie `vsp_locale=sv`. A second browser with the same saved session still shows English, and the saved session file carries no language cookie, so the rest of the suite runs in English. English restores the English menu and `lang="en"` |
| a11y: one h1, named buttons and links, labelled fields (*new*, 25 pages) | PASS | signed out: /, /sign-in, /no-such-page-e2e. Member: /, /week, /profile, /profile/malvacom, /explore, /explore?view=timeline, /explore?view=map, /scout, /copilot, /trust, /sources, /profile/no-such-company. Staff: /staff/compare (two members), /staff/ecosystem, /profile, /profile/embeddedart, /staff/handoffs, /staff/injection-demo, /staff/checks, /trust, /explore, /sources |

The a11y helper (`accessibilityProblems` in e2e/helpers.ts) was checked on a
test page with two h1s, an icon-only button, a link with only aria-hidden
text, a field with only a placeholder and an unlabelled select: it reported
exactly those five, and nothing on clean markup.

### Transient failures (second run)

Each one passed when run again a minute later.

- **10. Data labels** (22:41 UTC): /explore showed its error page "The
  opportunities could not be loaded", and the browser console had
  `PostgresError: (EMAXCONNSESSION) max clients reached in session mode - max
  clients are limited to pool_size: 15`. See finding 1.
- **Wording, member screens** (22:43 UTC): `page.goto: net::ERR_ABORTED` on
  /explore (the dev server reloading after someone's edit).
- Earlier in the session, outside the counted run: the member sign-in in
  setup timed out once because a reload emptied the form; /explore?view=map
  and /scout each answered HTTP 500 with an empty page once; one uncaught
  "Invalid or unexpected token" on /sources (a half-saved file being
  compiled; that test still passed). All gone on the next run.

### Data in motion (second run)

- /explore (EmbeddedArt): 20 match notes, none "Not judged yet".
- /staff/compare: EmbeddedArt 5 of 5 with a why text; Malvacom 0 of 5
  ("Not judged yet"). The tests accept both.
- /trust Matching: measured (2 rows, dated).
- /week shows the 7 cards stored earlier; their data labels already use the
  new wording "Hand-entered".
- In Swedish, the /week heading still said "Your week" at 22:43 UTC while the
  menu was Swedish (the page texts are being translated tonight; not checked).

## Findings

1. **The hosted database ran out of connections under load** (once, 22:41
   UTC). Page: /explore as a member. Expected: the list. Seen: the error page
   "The opportunities could not be loaded", with `EMAXCONNSESSION max clients
   reached in session mode ... pool_size: 15` in the console. At the time
   several people were running tests and scripts against the hosted database
   next to the dev server; a full `npx vitest run` at 22:47 UTC had 7
   integration failures that passed when re-run in smaller groups.
   Probable owner: `lib/db/index.ts` (`postgres(url, { prepare: false, max: 5 })`,
   used by both jobs and requests through `withUserDb`) together with
   `DATABASE_URL`, which is the Supabase session pooler (`.env.example`:
   "Hosted: the session-pooler connection string"). Each process may hold 5
   of the 15 session clients, so three busy processes fill the pool; three
   warm Netlify function instances would do the same. Fix: point the app at
   the transaction pooler (port 6543; `prepare: false` is already set for it)
   and keep the session pooler for migrations, or lower `max` for the server,
   or raise the pool size in Supabase. Not verified further (the env file is
   not read by this suite).
2. **"Show it in the list" lands on the row but does not highlight it.**
   Page: /explore?view=map, select a pin, "Show it in the list". Expected: the
   row is highlighted, as `app/explore/explore-list.tsx` intends with
   `target:bg-muted`. Seen: the page scrolls to the row, but `:target` is not
   set, because next/link navigates with `history.pushState`, which does not
   change `:target`. Probable owner: `app/explore/explore-map.tsx`
   (`TestbedCard`, `<Link href={listHref}>`). Fix: make that one link a plain
   `<a href={listHref}>` (a real navigation, so the browser sets `:target`), or
   mark the row from `location.hash` in the list. Test 4d records it without
   failing: the brief asks that the link lands on the row. Minor.
3. **The suite could have written the demo password into its report** (fixed
   in `e2e/helpers.ts`). Playwright's failure snapshot (`error-context.md`,
   also attached to the HTML report) lists every input's value, a password
   field included. A sign-in that failed after the password was set would
   have put it into `test-results/` and `playwright-report/` (git-ignored, but
   easy to share). `signInThroughForm` now empties password fields before it
   rethrows. The one sign-in failure in this session had an empty field
   (checked without printing it).

### Observations (not failures)

4. **/profile/no-such-company answers HTTP 200**, with
   `<meta name="robots" content="noindex">`. `notFound()` runs inside a
   Suspense boundary after the response has started, which Next.js documents
   (node_modules/next/dist/docs/.../not-found.md: the response "keeps its 200
   status. Next.js adds a noindex tag"). The page itself is right; an unknown
   top-level address answers 404.
5. **A stale comment in `app/explore/filter-form.tsx`** (above the "Clear"
   button) says the e2e suite finds "Filter" without exact matching. It is
   exact now, so "Clear" could become "Clear filters" if wanted.
6. **The first run's observations, now:** the eligibility sentence on /trust
   is still a paragraph (by design, observation 2). "Sign out" now calls
   `signOut({ scope: "local" })` in `app/actions/auth.ts` (observation 3,
   fixed in the working tree; still never pressed). Links announced as
   buttons (observation 4) remain, e.g. "Clear" on /explore, "Go to the start
   page" on the not-found page and the header's "Sign in". Trust report and
   data status section titles are h2 headings now (observation 5, fixed).
   First loads are still slow on the dev server: /explore up to 12 s, and the
   data label test once took 54 s.

## Not exercised, and why

- **Useful / Not relevant**, **Ask BSP**, **Send to BSP staff**, the
  **profile editor's Save**, **Add**, **suggested-update review**, the
  **priority switches**, **Ask Scout** and **Sign out**: they change real
  data or end shared sessions (see the first run's list below). Unchanged.
- **The Copilot questions** (6a, 6b): skipped with `E2E_SKIP_COPILOT=1`; the
  free model endpoint is busy and each question stores a chat turn. The side
  sheet is only opened and closed; no question is sent from it.
- **The error pages** (`error.tsx`, `global-error.tsx`): there is no way to
  make a page fail from the browser without breaking the server or the data.
  /explore's error page was seen once by accident (finding 1): one h1, the
  explanation, a reference number, "Try again" and "Go to the start page".
- **The language switch** beyond the member menu and `<html lang>`: not the
  signed-out or staff header, and not the page texts, which are being
  translated tonight.
- **The a11y checks with the Copilot sheet open**, and keyboard order other
  than the map pins.
- **e2e/rerank.spec.ts**: another person's test, not run. No project in
  `playwright.config.ts` matches it, so `npm run e2e` never runs it.
- Staff **Service checks** "Run" and **Import members**: call outside services.

## Data left behind (second run)

- Copilot chat turns: none (skipped).
- Saved items: none. Step 2a's Save was undone and checked after a reload in
  every run.
- The language cookie lived only in test 12's own browser and ended with it;
  the test switched back to English first.
- Sessions: every run signs in two or three times (setup twice, step 1 once).
  This session ran the suite or parts of it 14 times, so about 30 new
  Supabase auth sessions for embeddedart@ and staff@. Sign out is never used.

## How to run

    npm run e2e                         # whole suite against http://localhost:3000
    BASE_URL=https://... npm run e2e    # another server (it never starts one itself)
    E2E_SKIP_COPILOT=1 npm run e2e      # skip the two Copilot questions (each stores a chat turn)
    npm run e2e -- --project=staff      # one part: setup, member, staff, phone, wording, site, a11y
    npm run e2e -- --grep "4d\."        # one test by its number
    npm run e2e:report                  # open the HTML report of the last run

The projects: `member`, `staff` and `phone` (375 px wide) walk the demo path;
`wording` checks that our labels never say "eligible"; `site` holds the
Copilot side sheet, the not-found pages and the language switch; `a11y` checks
one h1, named buttons and links and labelled fields on 25 pages.

`npm run e2e` loads `.env.local` into the test process (`node
--env-file-if-exists=.env.local`), so the sign-in step gets
`DEMO_USER_PASSWORD` from the environment. The password is typed with an
evaluate call, not `fill()`, so it never appears in a step title; it is wiped
from the form before a failed sign-in is reported (finding 3); traces and
videos are off; the session files are in the git-ignored `e2e/.auth/`.
Screenshots are kept for failed tests only, in `test-results/`.

---

## First run: 14 Nov 2026, 21:00 to 21:25 UTC

The first real browser walk-through of every screen, signed in through the
real sign-in form, while other people were editing the screens and the
matcher's judgements were being regenerated.

Final run (21:21 UTC, `E2E_SKIP_COPILOT=1`): **28 passed, 2 failed, 2 skipped**.
The two skipped tests are the Copilot questions: they passed in the two full
runs before (21:0x and 21:16 UTC) and were left out of the last run so that it
would not store more chat turns (see "Data left behind").
No browser console errors or uncaught page errors were seen in any test.

### Steps

| Step | Result | What the run saw |
| --- | --- | --- |
| setup: sign in as member and as staff through the form | PASS | member lands on /week, staff on /staff/compare |
| 1. Start page -> Sign in -> /week with cards | PASS | 7 cards: 6 matches, 1 trend note. Every match card has "Potential match", Why it fits, Next step, What is uncertain and a source link |
| 2a. Save, then unsave | PASS | "FMV Naval Test Ranges (Naval Test Centre, Karlskrona)": Save -> "Saved for your company." -> still saved after a reload -> unsave -> "Removed from saved." -> still unsaved after a reload |
| 2b. Add to calendar | PASS | downloads `the-baltic-marine-watchdog-challenge.ics`, starts with BEGIN:VCALENDAR and has a VEVENT |
| 3a. /profile: eight fields with status badges | PASS | Summary, Products and services, Technologies, Application areas, Markets, Geography: Stated; Projects and priorities: Missing; Likely interests: Corrected by member |
| 3b. Evidence of a claim | PASS | "Evidence: n quotes" opens; the quote is highlighted (`<mark>`), with an http(s) source link and "Retrieved ..." |
| 3c. Editor opens, Cancel | PASS | "Edit Technologies" opens a text box with Save and Cancel; Cancel closes it and the field text is unchanged |
| 3d. Priority switches present | PASS | Off: Funding; On: Testing and testbeds; Off: Partners; Off: Events; Off: New markets (not toggled) |
| 4a. /explore: filter by kind | PASS | All 188 -> Kind = Funding call gives fewer, every row a funding call |
| 4b. /explore: filter by deadline | PASS | All 188; Open now 65; Closing within 30 days 18 |
| 4c. /explore: timeline view | PASS | "Funding call deadlines" and "Events" sections; 20 months in the bar chart |
| 5. /scout: stored brief | PASS | the pre-run brief "Which test facilities and funding could fit an underwater sensor we want to trial next year?" opens from "Your briefs": Done, 8 options, each with "Potential match" and a "Source:" http link |
| 6a. /copilot: relevant question | PASS (runs at 21:0x and 21:16 UTC; skipped in the final run) | "Which test facilities could we use for an underwater sensor?" -> chip "In scope", answer with [n] citations and a Sources list, e.g. "FMV Naval Test Ranges in Karlskrona test sensors on surface ships, submarines and other vessels ... [1]". About 6 s. No "busy" retry needed in the 21:16 run |
| 6b. /copilot: "What is the capital of Australia?" | PASS (same two runs) | chip "Out of scope", text exactly the fixed OUT_OF_SCOPE_REPLY. About 3 s |
| 7a. /trust: quote check, link health, source status | PASS | Quote check 3 rows, Link health 1 row, Source status 9 rows, each dated 14 Nov 2026 |
| 7c. /trust: matching numbers | PASS (final run) | Matching table with 2 rows, dated 14 Nov 2026. In an earlier run (about 21:10 UTC) it said "not measured yet": data in motion, see below |
| 7b. /sources: every source has a status | PASS | 9 sources: vinnova, energimyndigheten, eu_funding, bsp_news, bsp_members, tcl_events "Live · read 14 Nov 2026"; bsp_events, regional, testbeds "Hand-entered" |
| 8. Member opens /staff/compare | PASS | redirected to /week; no "Compare members" heading |
| 9a. Staff menu | PASS | Compare, Ecosystem map, Company profiles, Handoffs, Explore, Injection test, Trust report, Service checks; "BSP staff" badge; no member menu |
| 9b. /staff/compare EmbeddedArt vs Malvacom | PASS | two different top fives, 5 items each |
| 9c. /staff/ecosystem: click a connection | PASS | clicking the line "Techinova and NKT" in the graph opens the pair: Stated basis text, and "Neither company has expressed interest. ..." |
| 9d. /profile as staff | PASS | 56 companies listed; EmbeddedArt opens /profile/embeddedart with "Public profile" and 8 fields |
| 9e. /staff/handoffs and /staff/injection-demo | PASS | both open; the injection demo shows a recorded run |
| 9f. /week not offered to staff | PASS | no "Your week" in the staff menu; /week redirects to /staff/compare |
| Phone (375 px): /week, /profile, /explore | PASS | none of the three scrolls sideways (measured by trying to scroll the page) |
| Phone: Menu button | PASS | the links are folded away; "Menu" opens the member menu |
| Wording, signed out (/, /sign-in) | PASS | |
| Wording, member screens | **FAIL** | see finding 1 |
| Wording, staff screens | **FAIL** | see finding 1 |

### Findings (first run)

1. **/trust says "eligibility" as a row label** (fixed by 22:19 UTC; test 9h
   now guards it). Page: /trust, section "Red-team
   tests", table column "Group". Expected: none of our labels or headings say
   "eligible"/"eligibility". Seen: a row whose label cell is the text
   `eligibility` (the raw group id of the red-team prompts). The test treats the
   first cell of a table row as a label. Probable owner:
   `app/trust/sections.tsx` (`RedTeamSection` prints `g.group` as is); the id
   comes from `eval/redteam-prompts.json` (group `"id": "eligibility"`). A
   display name for the group would fix it.

#### Observations (not failures; for the orchestrator to judge)

2. **Our own sentence on /trust uses the word.** The Matching section shows the
   paragraph "The system never decides eligibility: every match is a "potential
   match". Whether a company can apply stays a decision for people." It is a
   paragraph, not a label or heading, so the check does not fail on it.
   Owner: `lib/trust/report.ts` (`ELIGIBILITY_SENTENCE`). Other hits of the word
   were quoted text and are fine: call descriptions on /explore ("Expected
   Impact: ..."), the planted instructions and the judge's refusal notes on
   /staff/injection-demo.
3. **"Sign out" ends the shared demo account everywhere.** `app/actions/auth.ts`
   calls `supabase.auth.signOut()` without a scope; supabase-js defaults to
   `scope: "global"`, which revokes every session of that user. During a demo,
   one person signing out of embeddedart@... would sign out everyone else using
   that account. Not pressed by this suite. Suggest `signOut({ scope: "local" })`.
4. **Links announced as buttons.** Links rendered with
   `<Button render={<Link/>} nativeButton={false}>` get `role="button"`: the
   start page and header "Sign in", "Add to calendar" and "Open source" on
   /week, and the buttons on the /week empty and staff notices. Screen readers
   call them buttons although they navigate or download. Owner: the Button
   pattern in `components/ui/button.tsx` and its callers. Minor.
5. **Trust report section titles are not headings.** On /trust (and the "Data
   sources" card on /sources) the section titles are `CardTitle` divs, so
   heading navigation cannot jump between "Quote check", "Link health" and so
   on. Owner: `app/trust/sections.tsx` (`Section`), `components/data-status-panel.tsx`. Minor.
6. **Slow first page loads.** Once, /sign-in took more than 20 s to render while
   other people were editing files (the dev server recompiling). The suite now
   waits up to 60 s for the sign-in form and 45 s for a page heading.

### Data in motion (first run)

The matcher's judgements were being regenerated during the run.

- /explore (EmbeddedArt): 20 "Potential match for you" notes, all with a why
  text, none "Not judged yet".
- /staff/compare: in the 21:16 run EmbeddedArt had 5 of 5 why texts and Malvacom
  0 of 5 ("Not judged yet"); in the final run both had 5 of 5.
- /trust Matching: "not measured yet" at about 21:10 UTC, measured (2 rows,
  dated) in the 21:16 and final runs. 7c is a separate test so this state is
  visible on its own.
- The Copilot's explanation of a match was not asked about.

### Not exercised, and why (first run)

- **Useful / Not relevant** on a card: re-ranks real data.
- **Ask BSP** on a card and **Send to BSP staff** in the Copilot: create a
  handoff, and the app has no undo. Test 6a also checks the Copilot answer did
  not send one.
- **Profile editor Save**, **Add** on an empty field, **suggested-update review**
  and the **priority switches**: change the gold companies' profiles. The editor
  is only opened and cancelled; the switches are only read.
- **Ask Scout** and the pre-run question buttons: would start or replay a run;
  only the stored brief is opened (a GET). The **Save** button on a Scout option
  is not pressed.
- **Sign out**: ends the demo account's sessions everywhere (observation 3).
- Staff **Service checks** "Run" and **Import members**: call outside services
  and jobs. The page is only opened (wording check).
- The **Copilot in the final run**: skipped with `E2E_SKIP_COPILOT=1`, see above.

### Data left behind (first run)

- **Copilot chat turns: 4** for EmbeddedArt (two full runs, each asking the two
  questions above, each in a new conversation; 5 if the first run retried after
  a "busy" reply, which was not recorded; the second run did not). The app has
  no way to delete a chat, so they could not be removed through the app.
- Saved items: none. Every Save was undone in the same test and checked after a
  reload.
- Each run signs in three times (setup twice, step 1 once), which adds Supabase
  auth sessions for embeddedart@ and staff@. Sign out is never used (it would
  end everyone's sessions).

How to run: see "How to run" above (unchanged, plus the `site` and `a11y`
projects).
