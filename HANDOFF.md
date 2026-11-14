# Handoff: Virtual Science Park

Written 2026-11-14, about 19:50 Swedish time, at the end of a long local
session. It is for a new Claude session (in the cloud) that has none of the
earlier conversation. Read it top to bottom once; sections 1 to 3 are the ones
that must not be skipped.

The repo's `README.md` is the reference for how each part works. This file is
the state of the work: what is done, what is half done, what to do next, and
the things that went wrong along the way.

---

## 1. Rules from the user (these override defaults)

1. **Never open, read, print or search any `.env` file**, including
   `.env.local`. Only `.env.example` may be read. To learn whether a key
   works, run the project's own scripts (`npm run check:nvidia`,
   `npm run check:services`); they load `.env.local` themselves and print
   PASS or FAIL without values. Never ask the user to paste a secret into
   chat. Pass this rule to every subagent.
2. **Do not push or merge to `main` without the user saying so.** Netlify
   builds on every push to `main` and the plan is low on build credits. Work
   and commit on `dev`; pushing `dev` builds nothing. When `dev` is finally
   merged: one build, then re-sync Inngest with
   `curl -X PUT https://jade-kashata-27a74f.netlify.app/api/inngest`. A commit
   message containing `[skip netlify]` skips a build.
3. **Keep it simple.** The user said "i think you overcomplicate it". Prefer
   the shortest working path, give click-by-click steps with exact menu names
   when they must do something in a dashboard, and prove things on the real
   system (a PASS on a real page or a real run), not in theory.
4. **Orchestrator and executor.** The user asked for the main session to plan,
   brief, review and commit, and to hand heavy build work to an Opus 5.5
   subagent that follows `.claude/agents/opus-executor.md` (executors do not
   commit or push). **Latest instruction, 2026-11-14 evening: "dont run more
   agents after these are done".** So do not start new subagents unless the
   user asks again. Small things are done inline anyway.
5. **The backlog sheet is the scoreboard.** A row is set to Done only when its
   "Done when" has been shown to work. Rows that are built but not proven stay
   as they are, with the reason told to the user.
6. Commit messages end with
   `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

---

## 2. What is in flight right now (read before touching anything)

### The judge and Your-week cards (A16, A17): built, unreviewed, mid-run

An Opus executor built the judge and the cards and then started the full judge
run over all 56 companies. The local session was stopped while that run was
still going. Its final report never arrived, so **nobody has reviewed this
code or read its output yet.**

- The code is committed on `dev` in a commit marked **WIP (unreviewed)**:
  `lib/judge/`, `lib/cards/`, `lib/inngest/functions/judge-company.ts`,
  `judge-all.ts`, `build-week-cards.ts`, `scripts/judge.ts`, `scripts/cards.ts`,
  `tests/cards.integration.test.ts`.
- It typechecks and its 56 unit tests pass. That is all that is known.
- The three jobs are **not registered** in `lib/inngest/functions/index.ts`
  and there are no npm scripts for them yet. Run them with
  `npx tsx --env-file-if-exists=.env.local scripts/judge.ts ...` and
  `scripts/cards.ts`. The header comment of each script lists its flags.
- Database at 19:48: 2240 ranked match rows, **433 judged**, 13 companies have
  judged rows, 55 still have unjudged ranked rows, **375 rows are rejected**,
  `week_cards` is empty. One `job_runs` row with job `judge-script` exists.
- The local run may have finished after this file was written. Check first:

  ```sql
  select count(*) filter (where rank is not null) as ranked,
         count(*) filter (where rank is not null and judged_at is not null) as judged,
         count(*) filter (where rejected) as rejected
  from matches;
  select count(*), count(distinct company_id) from week_cards;
  ```

**What to do with it, in order:**

1. Read `lib/judge/prompt.ts`, `verify.ts`, `company.ts`, `personal.ts`,
   `store.ts` and `lib/cards/select.ts`, `build.ts` against the brief in
   section 7 (A16, A17).
2. **Look hard at the rejection rate.** 375 rejections against 433 kept is far
   more than expected: the brief said to reject only when an opportunity
   clearly has nothing to do with the profile. Read 20 rejected rows with
   their `rejection_reason`. If the judge is too strict, fix the prompt, set
   the wrong rejections back (`rejected = false, rejection_reason = null,
   judged_at = null`) and judge again. A rejected row leaves the company's
   pool for good, so wrong rejections quietly empty the rankings.
3. Read EmbeddedArt's 20 personal judgements. Check each `why` names one
   concrete thing from the profile and one from the opportunity, each
   `next_step` is an action for this week, and nothing claims eligibility.
4. Finish judging: `scripts/judge.ts` with no slugs picks up every company
   that still has unjudged ranked rows. NVIDIA rate-limits at roughly 30 to 45
   requests a minute; the script waits and retries.
5. Build the cards: `scripts/cards.ts`. Print the three gold members' cards.
   Confirm one company gets a `kind = 'trend'` card (that closes A27).
6. Register `judgeCompanyJob`, `judgeAllJob`, `buildWeekCardsJob` in
   `lib/inngest/functions/index.ts`, add npm scripts `judge` and `cards`,
   add a README section, run `npm run typecheck`, `npm run lint`,
   `npx vitest run`, commit, push to `dev`.
7. Mark A16 (row 28), A17 (row 29) and A27 (row 39) Done in the sheet once the
   "Done when" of each is true.

### Nothing else is running

Every other executor finished and its work is reviewed and committed.

---

## 3. What is left of the A stream

| ID | Task | State | What is missing |
| --- | --- | --- | --- |
| A7 | Hand-check the gold profiles | Team's job | The team fills in `data/gold-profiles/*.json` (see section 7, A21) |
| A16 | Judge and explanations | WIP, see section 2 | Review, finish the run, register, commit |
| A17 | Your-week cards | WIP, see section 2 | Same; cards are not built yet |
| A21 | Accuracy and quote-check eval | Built and committed, not marked Done | Accuracy numbers need A7's verdicts; then run `npm run eval` |
| A23 | Schedules and profile refresh | Built and committed, not marked Done | A scheduled run must show in the Inngest history (first chance: 03:00 with a running Inngest server, or after a deploy to `main`) |
| A24 | Cost measurement | Not started | Small script, see below |
| A27 | Trend analyst | Built, committed, notes stored, not marked Done | Needs one trend card to appear in a company's week (step 5 above) |

Everything else in the A stream (A1 to A6, A8 to A15, A18 to A20, A22, A25,
A26, A28) is Done in the sheet.

### A24, cost measurement: what to build (do it inline, no agent)

Backlog: "Record tokens and cost of profiling all members and of one matching
run. Work out cost per member per month." Done when: "Real cost numbers are
ready for the pitch."

Plan that was agreed in the session:

- `lib/cost/prices.ts`: a price table with the date it was checked.
  Checked 2026-11-14: **Claude Sonnet 5.5 $2 input / $10 output per million
  tokens** (cache reads $0.10), **Claude Haiku 5.5 $0.10 / $0.50** (prompts up
  to 100K tokens), Batch API 50% off, **Voyage voyage-4 $0.06 per million
  tokens with the first 200 million free**. Look prices up again before
  quoting them; do not trust this file after a few weeks.
- `scripts/cost.ts` (npm script `cost`): reads `job_runs`, sums input and
  output tokens per job, prices them as if run on Claude (profiler, judge,
  connections, trends on Sonnet 5.5; the tagger on Haiku 5.5), prints a table
  and the cost per member per month.
- Be honest in the output: the tokens were counted by NVIDIA's Nemotron
  tokenizer, not Claude's. Show a low number (as measured) and a high number
  (times 1.35, the documented upper bound of the newer Claude tokenizers).
- Monthly model, worst case: every member re-profiled weekly, every match
  judged again weekly, tags and embeddings redone weekly, one trend run and
  one connections run a week shared by all members. Scout and Copilot (B
  stream) are not built and not in the number: say so.

Measured so far (real runs on 2026-11-14):

| Run | Input tokens | Output tokens | Where recorded |
| --- | --- | --- | --- |
| Profiling 56 members (59 runs in total) | 199,823 | 46,435 | `job_runs`, job `profile-company` |
| Tagging 183 opportunities + 56 companies | 59,148 | 13,051 | executor's report only (script run, not in `job_runs`) |
| Embedding the same (Voyage) | about 57,000 | n/a | executor's report only |
| Connections, one full run (60 pairs) | 63,888 | 6,790 | executor's report only |
| Trend notes, one normal weekly run | 20,000 to 35,000 | 1,000 to 1,600 | executor's report only |
| Judge | not known yet | not known yet | `job_runs`, job `judge-script` (check after the run) |
| Matcher ranking | 0 | 0 | SQL only, no model |

---

## 4. The project in one page

**What it is.** A hackathon project for Blue Science Park (BSP) in Karlskrona,
Blekinge, Sweden. BSP has about 56 member companies (marine technology,
defence, sensors, cyber security, AI, energy). The app builds a public profile
of each member from its own website, collects funding calls, testbeds, events
and news, and ranks them per company with a reason, a next step and what is
uncertain. Members get a "Your week" page; BSP staff get comparison and
connection tools. Trust is the selling point: every profile claim carries a
word-for-word quote that is checked against the stored page text, the system
never says a company is "eligible" (only "potential match"), and private data
is protected by row-level security in the database.

**Where things are.** This repo is public, so account ids are not written here; the user has them.

| Thing | Value |
| --- | --- |
| Repo | https://github.com/KokoobiGO/Virtual-Science-Park |
| Branches | `main` (deployed, old: has A1 to A5 only) and `dev` (all current work) |
| Live site | https://jade-kashata-27a74f.netlify.app, staff tools at `/staff/checks` |
| Netlify | project `jade-kashata-27a74f`, deploys from `main` only (site id: ask the user, not kept in this public repo) |
| Supabase project | "Hackathon", region eu-west-1 (project id: ask the user, or read it from the Supabase connector) |
| Inngest | app id `virtual-science-park`, environment `production` |
| Backlog | Google Sheet "Virtual Science Park — Backlog", tab `Backlog` (sheet id: ask the user, not kept in this public repo), columns ID, Task, Stream, Status, Owner, Tier, What it is, Done when, Depends on. Row = 12 + N for task A(N) (A1 is row 13, A28 is row 40) |
| The plan | "Solution Plan v2". It was never found as a file; the backlog and `lib/schemas.ts` are what remains of it |

**Stack.** Next.js 16.4.6 App Router (it has breaking changes: `AGENTS.md`
says to read `node_modules/next/dist/docs` before writing Next code),
TypeScript, Tailwind, shadcn/ui, Drizzle ORM on Supabase Postgres with
pgvector (`casing: "snake_case"`, migrations in `drizzle/`), Inngest v4 for
jobs, Voyage AI embeddings (voyage-4, 1024 dimensions), Resend for email, zod
v4, Vitest, cheerio + Readability + linkedom for page text.

**The model.** The backlog says Claude (Sonnet for the profiler, judge, digest;
Haiku for tagging). The team has no Claude key yet, so everything runs on
**NVIDIA's free API** with `nvidia/nemotron-3.5-lightning-30b-a3b` for both
the "main" and the "fast" slot (`lib/nvidia.ts`; `lib/llm.ts` holds the Claude
settings for later). The small model is the main limit on quality everywhere:
noisy tags, a retry that rarely helps, trend notes that read as lists. A
switch to Claude is expected to help most of these.

**Streams.** S (setup) is Done. A (agents and data) is nearly done, see
section 3. B (Scout and Copilot), C (frontend) and D (evidence and pitch) are
all still To do and were not touched in this session.

---

## 5. Working in this repo

### Local setup (the previous session's machine)

- `npm run dev` serves the site on :3000. `npm run inngest:dev` serves the
  Inngest dev server on :8288. `.env.local` has `INNGEST_DEV=1`, so jobs run
  locally, and its `DATABASE_URL` points at the **hosted** Supabase database,
  so local runs write real data.
- Send an event: `curl -X POST http://127.0.0.1:8288/e/dev -H "Content-Type:
  application/json" -d '{"name":"app/match.requested","data":{}}'`. Read runs
  at `/v1/events/<id>/runs`; a run is finished when `ended_at` is set (the
  `status` field says "Completed" too early). A failed step's error is at
  `POST /v0/gql` (`run(runID) { trace { childrenSpans { outputID } } }` then
  `runTraceSpanOutputByID`).
- After adding or changing a function locally:
  `curl -X PUT http://127.0.0.1:3000/api/inngest`.

### In a cloud session

A cloud session has no `.env.local`, no local Inngest server and no dev
server. Unit tests run without any keys. Everything that touches the database
or a model needs the environment variables named in `.env.example` set in the
cloud environment (the user must do that; never ask for the values in chat).
Without `DATABASE_URL` the integration tests in `tests/` skip themselves.
Check with `npm run check:services` and `npm run check:nvidia`.

### Checks before every commit

```
npm run typecheck
npm run lint
npx vitest run
```

At the last full run on `dev`: 301 tests passing before the matcher, eval,
connections, trends, judge and cards tests were added (each of those passes on
its own: matcher 24, eval 28, connections 32, trends 69, judge and cards 56).

### Things that bit us (do not rediscover them)

- **Netlify cuts a request off at 30 s** (measured, a 504 at 30.0 s; not 60).
  Inngest runs with `checkpointing: false` so every step is its own request.
  Model calls use a 26 s timeout. Keep each job step well under 30 s.
- **Import `cheerio/slim`, never `cheerio`.** The main entry loads its own
  undici, which takes over Node's built-in fetch and now and then crashes the
  whole process (an assert in undici's client-h1; 4 crashes in about 25 runs).
  The slim parser adds no `<body>` around a fragment: `lib/fetcher/extract.ts`
  handles that.
- **Thinking must be off** on Nemotron (`chat_template_kwargs:
  { enable_thinking: false }`): with it on, one profile runs past 26 s.
- **Quotes are never translated.** The profiler prompt says so with a right
  and wrong example; before that only 2 of 9 quotes were found on the page.
- **The database client survives hot reloads** on `globalThis`. After a schema
  change `lib/db/index.ts` now reconnects by itself (it compares the tables'
  column names); before that fix a new column gave
  "Cannot read properties of undefined (reading 'replace')".
- **Voyage without billing: 3 requests and 10,000 tokens a minute.** A full
  embedding run takes about 10 minutes with `npm run enrich`. Adding a payment
  method in the Voyage dashboard removes the limit.
- **NVIDIA rate limit:** 429 at roughly 30 to 45 requests a minute with two
  calls in parallel. A 30 to 60 s wait clears it. Occasional 502s.
- **Writing escapes with the file tools:** typing `​` in a Write or Bash
  parameter saves the literal invisible character. Write such characters with
  a small script (`chr(92)` in Python) or as `\u{200B}`, then check the file.
  A `\\n` inside a heredoc Python string becomes a real newline.
- **A foreground `sleep N; command` is blocked** in the harness: use a
  background command or a loop with a condition.
- **ESLint and Vitest ignore `.claude/**`** on purpose (a subagent's worktree
  once produced 103 lint problems).
- **`npm run db:seed` overwrites** the three gold members' imported values
  with fixture values. Do not run it against the hosted database now.
- **Jobs and scripts use `getDb()`** (database owner, bypasses row-level
  security). Request paths (route handlers, server actions, Copilot tools)
  never do: they use `withUserDb()` from `lib/db/user.ts`.

---

## 6. Database state (hosted Supabase, 2026-11-14 19:48)

Migrations applied: `0000_extensions`, `0001_tables`, `0002_rls`,
`0003_profile_status` (enum + `companies.profile_status`, `profile_note`),
`0004_matching_tables` (`companies.tags`, `week_cards`, `trend_notes`,
`connections`, with their row-level security policies).

| What | Count |
| --- | --- |
| Companies | 56, all profiled: 50 `profiled`, 6 `thin`, 0 `failed` |
| Active claims | 448 (56 x 8 fields; 273 supported, 175 `missing`) |
| Real opportunities | 183, all tagged and embedded |
| Fixture opportunities (`external_id` starts with `fixture-`) | 15, simulated, skipped by every job |
| Ranked matches | 2240 (56 companies x 2 modes x 20) |
| Judged ranked matches | 433 and rising (see section 2) |
| Week cards | 0 |
| Trend notes | 5 (week of 2026-11-09: ai, cyber, defence, marine, sensor; energy has none) |
| Connections | 6 |
| Eval runs | 5 (`link_check` x 3, `profile_accuracy`, `quote_check`) |

Opportunities by source: EU Funding & Tenders 130, Vinnova 15,
Energimyndigheten 11, Curated testbed list 9, Regional funding (hand-entered)
8, BSP and MTC event series 5, Blue Science Park news 4, Tech Concept Lab 1.

The thin companies: ballou (website certificate expired),
karlskrona-kommun (website needs JavaScript), blekinge-business-incubator,
dnv-cyber, kingspan-baga, nexer.

The three gold members: `techinova` (safer electricity grids),
`embeddedart` (embedded systems and sensors for maritime surveillance; has the
private priority "testing"), `malvacom` (IT and software consultancy). Only
these three have private data; for the other 53 the personal and public
rankings are identical.

---

## 7. What was built, task by task

`README.md` has a section for each of these with the events and the rules.
This is the short version plus what the README does not say.

**S1 to S11 (setup): Done.** Six services verified on the live site
(NVIDIA, Inngest, Voyage, Resend, Supabase, Netlify) at `/staff/checks`.

**A1 page fetcher.** `lib/fetcher/` and `lib/snapshots.ts`
(`fetchSnapshot({ url, source, companyId })`): 15 s, 5 MB, manual redirects,
no private hosts, sha256 of the clean text, reuses an unchanged snapshot,
refuses pages under 50 characters. Known limits: it ignores `robots.txt` and
cannot read JavaScript-only pages.

**A2 member import.** `lib/members/`, job `import-members`
(`app/members.import.requested`). Reads BSP's WordPress API
(`https://www.bluesciencepark.se/wp-json/wp/v2/medlem`).

**A3, A4 normaliser and quote verifier.** `lib/normalize.ts`,
`lib/quote-check.ts` (`verifyQuote`, minimum 10 characters, whole-word match).
Limit: it proves the quote is on the page, not that the quote supports the
value.

**A5, A6, A8 profiler.** `lib/profiler/`, jobs `profile-company`
(`app/company.profile.requested`, data `{ slug, dryRun?, refresh?, model?,
thinking? }`, two steps at a time) and `profile-all-members`
(`app/members.profile.requested`, `{ force?, limit? }`). Reads two pages per
company (home page cut at 12,000 characters, BSP member page). Thin = fewer
than 3 of the 7 factual fields supported. `npm run profile:status`.

**A9 to A13, A25, A26 collectors.** `lib/collectors/` (contract in `types.ts`,
`storeCollected()` in `store.ts`, `liveOrCached()` in `cache.ts`), job
`collect-sources` (`app/sources.collect.requested`, nightly 03:00),
`npm run collect -- <source|all> [--dry]`. Keys: `vinnova`,
`energimyndigheten`, `eu_funding`, `regional`, `testbeds`, `tcl_events`,
`bsp_events`, `bsp_news`. Things to know:
- Vinnova's open data API answers with a "being phased out, use GDP" warning;
  the replacement needs an account and key. Contacts are Vinnova staff names
  and emails from their open data.
- Energimyndigheten: an undocumented JSON endpoint; descriptions are short
  teasers (about 170 characters), which is thin for matching.
- EU: the unofficial search API; six text searches plus four programmes, 129
  topics. Paging is unreliable so it never pages.
- Testbeds: 9 of 27 stored. 18 are left out with `linkOk: false` in
  `data/testbeds.seed.json` because the link is dead or on ri.se, which blocks
  scripts. Someone should open the six RISE pages in a browser (towing tank,
  Cyber Range, EMC, Robust electronics, Fiberlab, High-voltage lab).
- Regional: Interreg South Baltic's last calls closed 2026-11-04; it is stored
  with that past deadline and the matcher leaves it out.
- Hand-entered sources are stored with `simulated = true`, the plan's label
  for anything typed in by the team, so real Almi loans will show as
  "simulated" in the UI unless a separate state is added.
- Events: a date without a year allows up to 90 days before the publish date
  (a stricter rule turned a past event into a 2027 one). TCL event pages hold
  a structured date the API does not return; multi-session posts get the
  first date in the text.
- "Driving urban transitions" is stored twice, under Vinnova and
  Energimyndigheten (the same call from two funders).

**A14 tags and embeddings.** `lib/tagger/`, `lib/embeddings/`, job `enrich`
(`app/enrich.requested`, nightly 03:30, sends `app/match.requested` when it
enriched something), `npm run enrich`, `npm run similar -- <slug>`. A row is
picked up when its embedding is empty. Tags are noisy with the small model:
75 of 183 opportunities and 23 of 56 companies have no tag; Stena Line has no
"marine"; a service-dog company got "defence".

**A15, A18, A22 matcher.** `lib/matcher/` (`rankCompany` is one SQL
statement), job `match-companies` (`app/match.requested`,
`app/company.profile.changed`, nightly 04:30), `npm run match`,
`tests/ranking.integration.test.ts`. Two fixes after the first run: similarity
is corrected for opportunities that are close to every company, and the
priority boost follows the fit. Still weak: untagged companies get generic
picks; Malvacom is ranked on "ai" alone. Nothing sends
`app/company.profile.changed` yet: the frontend's profile editor (C7) must.

**A19 cached mode and source status.** `DEMO_MODE=cached` in collectors and in
`fetchSnapshot`; `lib/sources/health.ts`; `npm run sources:status`. Gap: the
member list import still reads BSP's site live in cached mode.

**A20 link checker.** `lib/links/`, `npm run check:links`. Latest stored run:
181 of 181 ok. Limit: the EU portal answers 200 for any topic id, so "ok"
there only means the portal is up; Energimyndigheten also answers 200 for a
missing page.

**A21 eval and the A7 export.** `lib/eval/`, `npm run gold:export`,
`npm run eval`. The export wrote `data/gold-profiles/{techinova,embeddedart,
malvacom}.json` (23 claims) with `verdict: null` on each. The team sets
"right" or "wrong". Profiling a gold member again gives every claim a new id
and resets the verdicts, so do the hand-check after the last profiling run.
First quote-check numbers: 314 of 419 quotes found; 85 of 448 fields dropped
to missing; the retry saved 2 of 87 fields; geography is dropped most (26).
Things the executor noticed in the gold profiles: EmbeddedArt's "UV-sensors"
is probably a mistranslation of "UV-sensorer" (underwater); Malvacom's
geography and markets are "missing" although its summary quote states them;
one Techinova inferred interest rests on news that Techinova is being bought.

**A23 schedules and refresh.** Crons (Swedish time): collectors 03:00 nightly,
enrich 03:30, match 04:30, profile refresh Mondays 04:00
(`refresh-profiles`, `app/members.refresh.requested`), trend notes Mondays
05:00, week cards Mondays 06:00 (not registered yet). Refresh mode
(`"refresh": true`): unchanged pages skip the model; a field counts as changed
only with a new value and a new quote; the new claim is stored as `suggested`
and the old stays active. Proven: skip on an unchanged company (Nexer), and
the changed path in `tests/refresh.integration.test.ts`. Not proven: a
scheduled run in the Inngest history.

**A27 trend analyst.** `lib/trends/`, job `trend-notes`, `npm run trends`.
Strong fact checks (dates, years, amounts, funders must be in a cited input).
With the small model the notes are "what closes when in your area", and about
one area in six fails the checks each run.

**A28 connection finder.** `lib/connections/`, job `find-connections`
(`app/connections.requested`), `npm run connections`. Six pairs stored. Best:
Kustbevakningen + EmbeddedArt, Techinova + AddSecure Smartgrids, NKT + Baltic
Offshore. Weak points: candidates are each company's nearest neighbours, which
are mostly the same kind of company; borderline pairs come and go between
runs; SAAB + Försvarsmakten is correct but useless. A stored `--limit` run
replaces the whole table.

**A16 judge (WIP).** The brief: five matches per model call; per match a
verdict (keep or reject, reject only when clearly unrelated), a `why` naming
one concrete thing from the profile and one from the opportunity, a
`nextStep` for this week that never assumes the company qualifies, one to
three `uncertainties`; checks in code that refuse eligibility words; public
rows judged from public claims only; personal rows copied from the public
judgement for companies without private data; after rejections the ranking is
refilled once (`rankAndStore`) and the new rows judged; `eligibility` stays
`potential_match`.

**A17 cards (WIP).** The brief: no model call; a card copies the judged
personal match (title, why, next step, uncertainties, the opportunity as the
source); up to 6 match cards in rank order, at most 3 of one kind and 2 of one
source, no news; plus one `trend` card when this week's `trend_notes` has a
note for one of the company's tags; stored per company and week
(`week_of` = Monday in Swedish time), replaced on rebuild.

---

## 8. Open questions for the user

- Delete the 15 old fixture opportunities and their (now unranked) fixture
  matches? They were left in case the frontend still builds against them.
- Add a "hand-entered" state so real regional funding is not shown as
  "simulated"?
- Add a payment method to Voyage to remove the 3-requests-a-minute limit?
- Is a Claude key coming? Most quality problems trace back to the small test
  model.
- Is `profile_note` fine as it is? Any signed-in user can read it, including
  the website error text.
- When should `dev` be merged to `main`? The live site still runs the old
  `main` (it has a `profile-preview` job and none of A6 onwards). After the
  merge: one build, then `PUT /api/inngest`, then check the crons appear.

---

## 9. Commits on `dev`, newest first

```
(next)  WIP (unreviewed): judge and Your-week cards (A16, A17) + this handoff
dd82b29 Add the trend analyst: one checked note per technology area per week (A27)
a85f243 Add the eval runner and the gold-profile export for the hand-check (A21, A7)
5041e8a Add the connection finder for staff (A28)
bbb09b9 Add the matcher: ranking SQL, stored top 20, re-rank on change, ranking tests (A15, A18, A22)
9b46112 Add tags and embeddings, link checker, cached mode, schedules and profile refresh (A14, A19, A20, A23)
696a1b2 Clear an opportunity's embedding when its text changes
04166d5 Add tables for the matching wave: company tags, week cards, trend notes, connections
b297c60 Add the collectors: funding, testbeds, events and news (A9-A13, A25, A26)
1e3c666 Add the shared base for collectors
8d2392d Profile all members with a thin-profile flag (A8)
fff341b Add the opus-executor agent for delegated build work
a940ff3 Profile a company end to end: quote check, one retry, storage (A6)
```

`main` is at `07a88cd` (A5 plus two fixes).
