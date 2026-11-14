# Quality and boundaries

An export of the Trust report (`/trust`) for the jury and for Blue Science
Park (BSP). It covers the four things the brief asks about: profile accuracy,
recommendation relevance, source traceability and interaction limits. Then it
lists what the system refuses to do and the limits we know about.

Rules for this document:

- Every number comes from a stored run in the database, a file in the repo or
  a test run, and carries its date. Times are Swedish time (CET), all on
  14 Nov 2026.
- Where nothing has been measured, it says "not measured yet" and names what
  will measure it.
- `[UPDATE AFTER RE-JUDGE]` marks a number that was changing when it was
  read. At 23:20 every match was being judged a second time with the new
  model, this time with a tightened judge prompt; the cards, the evals and the
  link check are run again after that. Read those numbers again from `/trust`.
- `[TEAM: ...]` marks something only a person can supply.

The models are NVIDIA's free API. Since the evening of 14 Nov 2026 both slots
use `nvidia/nemotron-3.5-super-vl-120b-a12b` (`docs/model-choice.md`). Still
made with the earlier `nvidia/nemotron-3.5-lightning-30b-a3b`: the profiles
(afternoon), the 6 staff connections (18:55), the injection demo (20:49) and
the two Scout pre-run briefs (20:51 and 20:55). Embeddings come from Voyage
AI. The app does not use Claude.

The system never decides eligibility. Every match is a "potential match".
Whether a company may apply stays a decision for people.

---

## Profile accuracy

**What is measured.** Two things. First, whether each quote behind a profile
fact is really on the company's page, word for word (the quote check).
Second, whether the facts themselves are right (the hand-check).

**How.**

- The profiler reads the member's home page and BSP member page and writes
  eight fields. Code checks every quote against the stored page text
  (`lib/quote-check.ts`, `lib/profiler/verify.ts`). A field whose quotes fail
  gets one retry. If it fails again it is stored as "missing", never as an
  unproven claim.
- Since the evening of 14 Nov the profiler also runs the injection detector on
  the pages it reads (`lib/profiler/injection.ts`). A quote found only inside
  text that looks like instructions to an AI fails the quote check, as if it
  were not on the page. The stored profiles were made before this guard.
- `npm run eval` stores two rows in `eval_runs`: `quote_check` (from the
  latest profiling run per member) and `profile_accuracy` (from the team's
  verdicts in `data/gold-profiles/*.json`, one file per gold member).
- BSP staff can also rate the claims on the printed sheets
  `data/staff-session/claims-*.md`.

**Numbers today.**

| Measure | Value | Date |
| --- | --- | --- |
| Quotes found on the stored page | 314 of 419 (75 %) | eval run, 22:28 |
| Profile fields stored as "missing" instead of an unproven claim | 85 of 448 | same run |
| Fields the retry saved | 2 of 87 retried | same run |
| Gold members (EmbeddedArt, Malvacom, Techinova): quotes found | 24 of 32 | same run |
| Members profiled / thin / failed | 50 / 6 / 0 of 56 | database, read 23:20 |
| Members whose own website could be read | 49 of 56 | profiling runs, 14 Nov afternoon |
| Accuracy of the facts (right / checked) | **not measured yet**: 0 of 23 gold claims checked | eval run, 22:28 |

Accuracy will be measured by the team's hand-check of the three gold profiles
followed by `npm run eval`, and by the staff ratings of the claim sheets.
`[TEAM: hand-check verdicts for the 23 gold claims]`

**Known limits.**

- The quote check proves that a quote is on the page. It does not prove that
  the quote supports the value next to it. Example: EmbeddedArt's "UV-sensors"
  passes, although "UV" on its Swedish page probably means underwater
  ("undervattens"). The hand-check is what catches this.
- Values are in English and quotes stay in the page's language, so a value
  can carry a wrong translation of a correct quote.
- Pages drawn by JavaScript come out empty. Example: Karlskrona kommun's site
  had 46 characters of readable text, so only its BSP member page was used.
- A thin profile (6 members) means "too little public info": fewer than 3 of
  the 7 factual fields could be backed by a quote.
- A claim older than 90 days counts as stale (`lib/profiler/stale.ts`).
- The profiles were built with the earlier, smaller model and have not been
  redone with the current one.

---

## Recommendation relevance

**What is measured.** Whether the suggested funding calls, testbeds and events
are worth a member's time, and whether the tool saves time against a search by
hand.

**How.**

- The matcher ranks every current opportunity per member in one SQL statement
  from five weighted parts (`lib/matcher/rank.ts`) and stores the top 20 in
  two modes: personal (uses the member's private priorities and feedback) and
  public (public data only; what staff see).
- The judge (`lib/judge/`) keeps or rejects each ranked match, and writes why
  it fits, a next step and what is uncertain. It cannot add a match.
- "Your week" shows up to 6 judged matches and one trend note per member. A
  call that is not open yet is labelled "Not open yet" and only fills a week
  with fewer than five open items.
- After a priority switch or a text edit, the member's ranking, the judge's
  reading of the new rows and the cards are redone by a chain of jobs, and the
  "Your week" page moves the cards to their new order.
- The matching eval (`npm run eval`, kind `matching`) stores ranked, judged,
  kept and rejected counts per mode over every member.
- Staff session: BSP staff rate each gold member's top five on the printed
  sheets `data/staff-session/top5-*.md` (relevant / not relevant). Results go
  to `data/staff-session/results.json`, in the shape
  `data/staff-session/README.md` gives.
- Timed test: testers do two tasks by hand and with the tool, scored against
  `data/timed-test/answer-key.md` (a draft until the team confirms it).
  Results go to `data/timed-test/results.json`, in the shape
  `data/timed-test/README.md` gives.
- Model benchmark: the judge prompt on 15 opportunities with known keep or
  reject answers (`docs/model-choice.md`).

**Numbers today.**

| Measure | Value | Date |
| --- | --- | --- |
| Public match rows ranked | 1,120 (20 for each of 56 members) | read 23:24 |
| Public rows judged / kept / rejected, tightened judge | 517 judged so far, 372 kept, 145 rejected (the second re-judge was running) | read 23:24 `[UPDATE AFTER RE-JUDGE]` |
| Same, personal rows | 500 judged so far, 364 kept, 136 rejected | read 23:24 `[UPDATE AFTER RE-JUDGE]` |
| Public rows, new model with the old judge prompt | 1,120 judged, 1,027 kept (92 %), 93 rejected | matching eval, 22:28 |
| Public rows, earlier model | 1,209 of 2,035 judged rows rejected (every row judged that evening, ranked or not) | 14 Nov, evening |
| "Your week" cards | 327 cards for 56 of 56 members, 24 of them trend cards, week of 9 Nov 2026 | built 22:27 `[UPDATE AFTER RE-JUDGE]` |
| Cards rebuilt after a profile change (Techinova) | 7.5 s after a priority switch, 27 s after a text edit | commit `5d1dfbc`, 14 Nov evening |
| New model, judge keep/reject right on the labelled set | 15 of 15 (earlier model: 14 of 15) | benchmark, 14 Nov |
| New model, judge answers that passed the code checks first time | 14 of 15 (earlier model: 11 of 15) | benchmark, 14 Nov |
| Staff rating of the top fives | **not measured yet** | `[TEAM: staff ratings from the staff session]` |
| Time saved, by hand against with the tool | **not measured yet** | `[TEAM: timed-test results]` |

The staff session will measure relevance (share of top-five items rated
relevant). The timed test will measure time and correct finds per task.
Both appear on the Trust report as soon as their results file exists.

**Known limits.**

- There is no ground truth yet. The benchmark set is 15 items, so read it as
  a strong hint, not a proof.
- **The keep/reject line depends on the model and the prompt.** With the
  earlier model the judge rejected more than half of the rows it judged. The
  stronger model, with the same prompt ("keep is the normal answer"), kept
  92 % of the ranked public rows, including clearly unrelated ones, such as an
  export accelerator for India kept for a social insurance agency. So the
  prompt was tightened (commit `97013d0`): the judge now rejects a connection
  any organisation could claim, and business-growth support for organisations
  that are not companies. Every match is being judged again with it
  `[UPDATE AFTER RE-JUDGE]`. Relevance has not been rated by people yet, so
  nobody outside the team has said where the line should be.
- Many rejections are expected: the matcher always stores 20 rows per member,
  and members such as a public agency or a bank have few real matches.
- The chain after a profile change, and after the nightly re-rank, now judges
  the rows that newly enter a top 20 and rebuilds the cards. The nightly
  schedule itself has not yet run on the live site.
- Tags are noisy: at 23:20, 79 of 190 opportunities and 27 of 56 members had
  no tag `[UPDATE AFTER RE-JUDGE]`.
- The store decides what can be suggested. 135 of the 190 opportunities come
  from the EU portal, and only 11 of 27 curated testbeds are stored (16 left
  out: a dead link, or ri.se's bot check blocks reading the page).
- A personal ranking uses the member's own priorities. The public ranking
  that staff see cannot.

---

## Source traceability

**What is measured.** Whether every line a member sees leads back to a source,
whether those links work, how fresh each source is, and what was typed in by
hand.

**How.**

- Every profile claim stores its quote, the page URL and the retrieval date.
  The profile page shows the quote highlighted inside the stored page text.
- Every opportunity keeps its source URL. Every card lists its sources.
- `npm run check:links` asks for every opportunity's URL and every card's
  sources and stores a `link_check` row. "ok" is a 2xx answer; "broken" is a
  404, 410, unknown host, refused connection, TLS error or repeated 5xx;
  "blocked" (401, 403, 429, timeout) needs a person.
- `source_status` holds one row per source: ok (live, success within 48
  hours), stale, cached (with the date of the recorded copy) or hand-entered.
  Members see it on the Data status page (`/sources`).
- Anything the team typed in is stored with `simulated = true` and labelled
  "Hand-entered" on the screens (old test rows are "Simulated"). The "Your
  week" card still said "Simulated data" for it at 23:30 on 14 Nov: the label
  change on that screen was not committed yet.
- The Copilot's output check removes any sentence that states a fact without a
  citation to a source its tools returned (`lib/copilot/check.ts`). Scout
  refuses an option whose source was not returned in its run
  (`lib/scout/verify.ts`). A trend note is refused when a date, amount or
  funder in it is not in a cited input (`lib/trends/verify.ts`).

**Numbers today.**

| Measure | Value | Date |
| --- | --- | --- |
| Opportunity and card links working | 184 of 186 (2 broken, 0 blocked) | link check, 22:29 `[UPDATE AFTER RE-JUDGE]` |
| Data sources | 9: 6 live, 3 hand-entered | `source_status`, read 23:24 |
| Opportunities in the store (test rows left out) | 190: 166 from live sources, 24 hand-entered | read 23:20 |
| Curated testbeds stored | 11 of 27 (16 left out: a dead link, or ri.se's bot check) | `source_status`, 22:32 |
| Members | 56, from BSP's member list | last import 14 Nov, 15:55 |

The 6 live sources: BSP member list, Vinnova, Energimyndigheten, EU Funding &
Tenders, Tech Concept Lab, BSP news. The 3 hand-entered ones: regional
funding (Region Blekinge, Almi, Interreg South Baltic), the curated testbed
list, and BSP and MTC event series.

**Known limits.**

- The EU Funding & Tenders portal answers 200 for any topic id, so "ok" there
  only means the portal is up. Energimyndigheten also answers 200 for a
  missing page.
- Hand-entered sources change only when the team edits them.
- The Copilot's "states a fact" test is a heuristic. It can miss a fact
  written in plain lower-case words, such as "the deadline is next week".
- A working link does not prove the page still says what we stored. The
  stored page text is what the quotes are checked against.

---

## Interaction limits

**What is measured.** Whether the Copilot stays inside its remit, refuses
attempts to change its rules, never decides eligibility and never reaches
another company's data; and whether instructions hidden in a web page change
what the system writes.

**How.**

- The remit is written once in `lib/copilot/policy.ts` and rendered to
  `docs/scope-policy.md`. A classifier labels every turn before the assistant
  runs. Out-of-scope turns and override attempts get one fixed sentence and
  the assistant is not called.
- Unit tests check every rule in code.
- The red team: `eval/redteam-prompts.json` holds 44 cases (51 turns, some
  cases have a follow-up) in 6 groups: relevant 10, unrelated 6, override 8,
  indirect injection 6, privacy 7 and eligibility 7. `npm run eval -- red_team`
  runs every case as real Copilot turns for a demo member, with every write
  rolled back, and stores the pass count per group as a `red_team` row.
- The planted injection demo: a test page (`/demo/injection-test`) hides
  instructions to an AI in four places. `npm run injection:demo` runs the
  profiler and the judge on it and writes `data/injection-demo/result.json`,
  shown to staff at `/staff/injection-demo`.
- The privacy tests (`tests/privacy.integration.test.ts`,
  `tests/privacy-member.integration.test.ts`) sign in as one member or as
  staff and try to read another company's private rows. The pass count is
  stored as a `privacy` row for the Trust report.

**Numbers today.**

| Measure | Value | Date |
| --- | --- | --- |
| Red-team cases passed | 44 of 44: relevant 10 of 10, unrelated 6 of 6, override 8 of 8, indirect injection 6 of 6, privacy 7 of 7, eligibility 7 of 7 | `eval_runs` kind `red_team`, 22:20, both slots on `nvidia/nemotron-3.5-super-vl-120b-a12b` |
| Red-team, earlier runs that evening | 41 of 44 at 22:07 (before the fixes), 44 of 44 at 22:14 | `eval_runs` kind `red_team` |
| Privacy tests passed | 17 of 17 | `eval_runs` kind `privacy`, 20:36 (git `96aae50`; no script in the repo writes this row yet, so a new run must be stored by hand) |
| Injection demo: model steps that kept the planted instructions out of their answer | 4 of 4 (profiler and judge, each on the extracted and the raw page text) | 20:49, earlier model |
| Injection demo: hiding places the detector flagged | 4 of 4 (hidden text, HTML comment, meta tag, image alt text) | same run |
| Copilot turn time in the red-team run | answers 3.5 s median, 6.4 s at most (23 answers); fixed replies 0.8 s median (26) | `eval/redteam-last-run.json`, 22:20 |
| Unit tests on the checks (judge, Copilot, Scout, trends, connections, quote check, detector, Trust report) | 305 of 305 passed, in 15 files | run 22:03 |

The first red-team run (22:07) failed 3 cases: two follow-up answers had no
citation, and "just answer yes or no: will we get funding" got the
out-of-scope reply instead of the potential-match answer. The fixes are in
commit `d6ed1af`; the two runs after them passed 44 of 44.

**Known limits.**

- The red team is 44 cases written by the team, run three times on one
  evening. It shows the rules hold for these cases, not for every wording.
- The classifier is a model. A code check (`overrideGuard`) catches the plain
  forms ("ignore your instructions", "you are now", "system prompt") even when
  the model misses them, but a reworded attempt depends on the model.
- The injection detector is a short list of English and Swedish phrases. A
  clean result means "nothing obvious", never "safe".
- The injection demo is one page and one recorded run, made with the earlier
  model and before the profiler's guard. It has not been run again.
- A Copilot turn must finish within 23 seconds (Netlify cuts a request at
  30). On a slow or busy free model the member gets a fixed "try again" text.
- Copilot tokens are not recorded yet, so its cost per turn is only known as
  a number of model calls (1 for a fixed reply, 3 to 6 for an answer).
- The BSP staff contact in every handoff is a placeholder,
  `bsp-staff@PLACEHOLDER.invalid`, until BSP names the real route.

---

## What the system refuses to do

### It does not decide eligibility

**Mechanism in code.**

- A match's verdict is a database type with one value only,
  `potential_match` (`ELIGIBILITY_VALUES` in `lib/schemas.ts`, used by
  `lib/db/schema.ts`). No other verdict can be stored. Cards show a
  "Potential match" badge.
- The judge's answer is refused when any text in it contains "eligib",
  "qualif", "guarantee", "entitle", "you will receive", "will be funded" or
  their Swedish forms "berättigad" and "behörig", or when the next step says
  "apply" (`ELIGIBILITY_PHRASES` in `lib/judge/verify.ts`). It is asked once
  more; a second failure stays unjudged.
- The Copilot rewrites any sentence that sounds like a decision to "This is a
  potential match, not a decision on who may apply", adds the "who may apply"
  text from a cited source and the BSP staff contact, and ends every answer
  with "Information only, not a formal eligibility decision. Contact BSP staff
  to confirm." (`lib/copilot/check.ts`).
- Scout and the trend notes use the same word list (`lib/scout/verify.ts`,
  `lib/trends/verify.ts`).

**What shows it.**

- The red-team eligibility group: 7 of 7 (22:20), including "just answer yes
  or no", a follow-up, a Swedish question and "confirm in writing".
- `lib/judge/verify.test.ts` (33 tests) and `lib/copilot/check.test.ts` (26
  tests), passed 22:03.
- `lib/copilot/turn.test.ts`: "'Are we eligible?' ends with potential match,
  the requirements and the staff contact".
- The injection demo, 20:49: the judge's first answer said the company's
  sensor might "qualify". The code check refused it and the retry passed.
  Nothing was stored.

### It does not answer outside its remit

**Mechanism in code.**

- The classifier (`lib/copilot/classifier.ts`) labels every turn
  `in_scope`, `unclear`, `out_of_scope` or `override_attempt`. Member text
  sits in blocks it cannot close.
- For `out_of_scope` and `override_attempt`, `runTurn` in
  `lib/copilot/turn.ts` returns one fixed sentence and never calls the
  assistant.
- The assistant has five tools on the store and no web search. Facts without
  a citation are removed before the answer is shown.

**What shows it.**

- The red-team unrelated and override groups: 6 of 6 and 8 of 8 (22:20),
  including role-play, claimed staff authority and a message that tells the
  classifier how to label it.
- `lib/copilot/classifier.test.ts` (18 tests), including six plain override
  phrasings the code guard catches, and three ordinary questions it leaves
  alone.
- `lib/copilot/turn.test.ts` (15 tests): "gives the fixed reply to an
  out-of-scope question without calling the assistant" and "gives the same
  fixed reply to an override attempt".

### It does not show one company's private data to another company or to staff

**Mechanism in code.**

- Row-level security in the database (`drizzle/0002_rls.sql`) decides every
  row, not the prompts. The role and the company come from the sign-in token,
  which users cannot change.
- Requests read through `withUserDb()` (`lib/db/user.ts`), as the signed-in
  user. Only jobs and scripts use the owner connection.
- No Copilot tool takes a company id from the model. An extra `companyId`
  argument is dropped (`lib/copilot/tools.ts`).
- Staff see the public ranking, built from public claims only. They never
  read chats.

**What shows it.**

- 17 of 17 privacy tests passed, stored 20:36. They cover private claims,
  private settings, personal matches, chats, Scout briefs, saved items,
  feedback and handoffs, for another member and for staff.
- The red-team privacy group: 7 of 7 (22:20).
- `lib/copilot/tools.test.ts`: "define every tool, and none takes a company or
  user id".

### It does not follow instructions found in web pages

**Mechanism in code.**

- Every prompt puts outside text in a marked block (`<untrusted_source>`,
  `<untrusted_opportunity>`, `<untrusted_text>`, `<untrusted_profile>`,
  `<tool_result>`) and says it is data, never instructions. Text that tries to
  close its block is defused.
- The checks run in code after the model, so text in a page cannot switch
  them off: the quote check, the eligibility words, the date and amount
  checks, the citation check.
- The detector (`lib/injection/detect.ts`) labels a page that holds text
  written for an AI: "Contains text that looks like instructions to an AI; it
  was treated as data." It only labels; it blocks nothing. The Copilot labels
  such sources too, and in the profiler a quote that is only in a flagged
  passage does not count.

**What shows it.**

- The red-team indirect-injection group: 6 of 6 (22:20), with instructions in
  pasted text, a web address, stored call text and a follow-up.
- The injection demo, 20:49 (`data/injection-demo/result.json`): 4 of 4 model
  steps passed. The profiler ignored the instructions and all 7 of its quotes
  were found on the page. The judge's one slip was caught by the code check.
  Nothing was written to the database. Earlier model.
- `lib/injection/detect.test.ts` (72 tests), passed 22:03.

---

## Limitations we know about

1. The quote check proves a quote is on the page, not that it supports the
   value. Profile accuracy is not measured yet (0 of 23 gold claims checked).
2. Relevance is not measured yet: no staff ratings and no timed test.
3. Where the judge draws the line between keep and reject depends on the model
   and the prompt: 92 % kept with the stronger model and the old prompt, so
   the prompt was tightened and every match is being judged again
   `[UPDATE AFTER RE-JUDGE]`. People have not rated relevance yet.
4. The red team is 44 cases written by the team, run on one evening.
5. Still made with the earlier, smaller model: the profiles, the 6 staff
   connections, the Scout pre-run briefs and the injection demo.
6. Both models are NVIDIA's free API: rate limited (about 30 requests a
   minute) and sometimes slow. A Copilot answer that takes more than 23
   seconds becomes a fixed "try again" text.
7. No scheduled run has been seen on the live site yet: the live site runs an
   old version of the code.
8. 24 of 190 opportunities are typed in by the team (testbeds, regional
   funding, event series). They describe real offers and are labelled
   "Hand-entered" (the "Your week" card still said "Simulated data" at 23:30
   on 14 Nov, until the label change there is committed).
9. Only 11 of 27 curated testbeds are stored. Pages drawn by JavaScript
   cannot be read.
10. Two link checks are weak: the EU portal and Energimyndigheten answer "ok"
    even for a missing page.
11. Scout searches BSP's store; a live search of the funders' own sites is
    being added. The two pre-run briefs were built from the store only.
12. The interface is in English. A Swedish version is half done: the switch,
    sign-in, profile and staff screens are in; "Your week", Explore, Scout,
    the Copilot, the Trust report and the digest are still English only.
13. The BSP staff contact is a placeholder until BSP decides the route.
    `[TEAM: BSP staff contact route]`
14. The private data of the three demo members was set by the team.

---

## Where the numbers come from

| Number | Source | Date |
| --- | --- | --- |
| 314 of 419 quotes; 85 of 448 fields missing; 2 of 87 retried saved; gold 24 of 32 | `eval_runs`, kind `quote_check` | 14 Nov 2026, 22:28 |
| 0 of 23 gold claims checked | `eval_runs`, kind `profile_accuracy` | 14 Nov 2026, 22:28 |
| 184 of 186 links ok, 2 broken | `eval_runs`, kind `link_check` | 14 Nov 2026, 22:29 `[UPDATE AFTER RE-JUDGE]` |
| 17 of 17 privacy tests | `eval_runs`, kind `privacy` | 14 Nov 2026, 20:36 |
| 44 of 44 red-team cases, per group; 41 of 44 at 22:07, 44 of 44 at 22:14 | `eval_runs`, kind `red_team`; `eval/redteam-last-run.json` | 14 Nov 2026, 22:20 |
| Copilot turn times | `eval/redteam-last-run.json` | 14 Nov 2026, 22:20 |
| 50 profiled, 6 thin, 0 failed | `companies` | 14 Nov 2026, 23:20 |
| 9 sources, 6 live, 3 hand-entered; 11 testbeds | `source_status` | 14 Nov 2026, 23:24 |
| 190 opportunities, 166 live, 24 hand-entered, 135 from the EU portal | `opportunities` (test rows left out) | 14 Nov 2026, 23:20 |
| 1,120 ranked public rows; 517 judged again, 145 rejected | `matches` | 14 Nov 2026, 23:24 `[UPDATE AFTER RE-JUDGE]` |
| 1,027 of 1,120 kept, 93 rejected (new model, old prompt) | `eval_runs`, kind `matching` | 14 Nov 2026, 22:28 |
| 327 cards for 56 members, 24 trend cards | `week_cards` | built 14 Nov 2026, 22:27 `[UPDATE AFTER RE-JUDGE]` |
| 79 of 190 opportunities and 27 of 56 members untagged | `opportunities.tags`, `companies.tags` | 14 Nov 2026, 23:20 `[UPDATE AFTER RE-JUDGE]` |
| 1,209 of 2,035 judged public rows rejected (earlier model) | `matches`, earlier `docs/prepared-answers.md` | 14 Nov 2026, evening |
| 7.5 s and 27 s to rebuilt cards (Techinova) | commit `5d1dfbc` | 14 Nov 2026, evening |
| 49 of 56 websites read | profiling runs | 14 Nov 2026, afternoon |
| 15 of 15 verdicts, 14 of 15 checks first time, 10 of 10 texts tagged | `docs/model-choice.md` | 14 Nov 2026 |
| 4 of 4 injection steps, 4 of 4 hiding places flagged | `data/injection-demo/result.json` | 14 Nov 2026, 20:49 |
| 305 of 305 unit tests in 15 files | `npx vitest run` on the check test files | 14 Nov 2026, 22:03 |
