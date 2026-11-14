# Automated demo run (D13): results

The first real browser walk-through of every screen, signed in through the
real sign-in form. Chromium (Playwright 1.64.1), against the local dev server
at http://localhost:3000, on 14 Nov 2026 between 21:00 and 21:25 UTC, while
other people were editing the screens and the matcher's judgements were being
regenerated.

Final run (21:21 UTC, `E2E_SKIP_COPILOT=1`): **28 passed, 2 failed, 2 skipped**.
The two skipped tests are the Copilot questions: they passed in the two full
runs before (21:0x and 21:16 UTC) and were left out of the last run so that it
would not store more chat turns (see "Data left behind").
No browser console errors or uncaught page errors were seen in any test.

## Steps

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

## Findings

1. **/trust says "eligibility" as a row label.** Page: /trust, section "Red-team
   tests", table column "Group". Expected: none of our labels or headings say
   "eligible"/"eligibility". Seen: a row whose label cell is the text
   `eligibility` (the raw group id of the red-team prompts). The test treats the
   first cell of a table row as a label. Probable owner:
   `app/trust/sections.tsx` (`RedTeamSection` prints `g.group` as is); the id
   comes from `eval/redteam-prompts.json` (group `"id": "eligibility"`). A
   display name for the group would fix it.

### Observations (not failures; for the orchestrator to judge)

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

## Data in motion

The matcher's judgements were being regenerated during the run.

- /explore (EmbeddedArt): 20 "Potential match for you" notes, all with a why
  text, none "Not judged yet".
- /staff/compare: in the 21:16 run EmbeddedArt had 5 of 5 why texts and Malvacom
  0 of 5 ("Not judged yet"); in the final run both had 5 of 5.
- /trust Matching: "not measured yet" at about 21:10 UTC, measured (2 rows,
  dated) in the 21:16 and final runs. 7c is a separate test so this state is
  visible on its own.
- The Copilot's explanation of a match was not asked about.

## Not exercised, and why

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

## Data left behind

- **Copilot chat turns: 4** for EmbeddedArt (two full runs, each asking the two
  questions above, each in a new conversation; 5 if the first run retried after
  a "busy" reply, which was not recorded; the second run did not). The app has
  no way to delete a chat, so they could not be removed through the app.
- Saved items: none. Every Save was undone in the same test and checked after a
  reload.
- Each run signs in three times (setup twice, step 1 once), which adds Supabase
  auth sessions for embeddedart@ and staff@. Sign out is never used (it would
  end everyone's sessions).

## How to run

    npm run e2e                         # whole suite against http://localhost:3000
    BASE_URL=https://... npm run e2e    # another server (it never starts one itself)
    E2E_SKIP_COPILOT=1 npm run e2e      # skip the two Copilot questions (each stores a chat turn)
    npm run e2e -- --project=staff      # one part: setup, member, staff, phone, wording
    npm run e2e:report                  # open the HTML report of the last run

`npm run e2e` loads `.env.local` into the test process (`node
--env-file-if-exists=.env.local`), so the sign-in step gets
`DEMO_USER_PASSWORD` from the environment. The password is typed with an
evaluate call, not `fill()`, so it never appears in a step title; traces and
videos are off; the session files are in the git-ignored `e2e/.auth/`.
Screenshots are kept for failed tests only, in `test-results/`.
