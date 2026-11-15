# Handover: Virtual Science Park

Written 2026-11-14, about 22:00 Swedish time; brought up to date at about
23:30 the same evening. It replaces the earlier `HANDOFF.md` (written at
19:50 that day; its full text is in git history).

`README.md` is the reference for how each part works and how to run it. This
file is the state of the work: what is done, what is in flight, what is open,
and the rules. Times are Swedish time (CET).

---

## 1. Rules (they override defaults)

1. **Never open, read, print or search any `.env` file**, including
   `.env.local`. Only `.env.example` may be read. To learn whether a key
   works, run `npm run check:services` or `npm run check:models` (a fraction of a
   US cent in Claude calls): they load
   `.env.local` themselves and print PASS or FAIL without values. Never ask
   anyone to paste a secret into a chat. Pass this rule to every helper.
2. **Work on `dev` only.** `main` deploys to Netlify on every push and the
   build credits are low. **NEVER merge or push to `main` unless the project
   owner says so in that moment**: an earlier "yes" does not carry over. After
   a merge: one build, then
   `curl -X PUT https://jade-kashata-27a74f.netlify.app/api/inngest`. A commit
   message with `[skip netlify]` skips a build. `docs/deploy-checklist.md` has
   the steps for the merge.
3. **The backlog sheet is the scoreboard.** Google Sheet "Virtual Science
   Park — Backlog", tab `Backlog` (the sheet id is not kept in this public
   repo: ask the owner). A row is set to Done only when its "Done when" has
   been shown to work on the real thing. Built but unproven rows stay as they
   are, with the reason said.
4. **Keep it simple.** The shortest working path; exact click-by-click steps
   when someone must act in a dashboard; proof on the real system.
5. **Orchestrator and executors.** The main session plans, briefs, reviews and
   commits; executors (`.claude/agents/opus-executor.md`) build and **never
   commit or push**. Several executors may work in the same tree at once:
   each touches only the files its brief names.
6. **Claude since 2026-11-15.** Every model call goes through `modelChat()`
   in `lib/model.ts` (official `@anthropic-ai/sdk`). `MODEL_FOR` there says
   which step uses which model: Claude Haiku 5.5 for the Copilot's scope
   classifier, the tagger and the judge; Claude Sonnet 5.5 for the profiler,
   connections, trend notes, Scout and the Copilot's answers. The key is
   `ANTHROPIC_API_KEY`, paid per token. Until then the app ran on NVIDIA's
   free API (both slots on `nvidia/nemotron-3.5-super-vl-120b-a12b` from
   2026-11-14 evening, `docs/model-choice.md`); that code is gone. Claude has
   not been measured on the app's evals yet.
7. **Never "eligible".** The system only says "potential match". Code checks
   refuse eligibility words in the judge, Scout and the Copilot.
8. **Do not run `npm run db:seed` against the hosted database**: it writes
   fixture values over the three gold members.
9. **Jobs and scripts use `getDb()`** (bypasses row-level security). Request
   paths (pages, route handlers, server actions, Copilot tools) never do: they
   use `withUserDb()`.

---

## 2. Where things are

| Thing | Value |
| --- | --- |
| Repo | https://github.com/KokoobiGO/Virtual-Science-Park |
| Branches | `dev` (all current work; at 23:30 on 14 Nov, 41 commits ahead of `main`, last pushed `9cf3b3d`), `main` (deployed, at `07a88cd`: the A5 profiler prompt, 14 Nov 16:13) |
| Live site | https://jade-kashata-27a74f.netlify.app (staff tools at `/staff/checks`) |
| Supabase | project "Hackathon", region eu-west-1 (project id: ask the owner) |
| Inngest | app id `virtual-science-park`, environment `production` |
| Local | site on http://localhost:3000, Inngest dev server on http://127.0.0.1:8288; the team's `.env.local` points at the hosted database, so local runs write real data |

---

## 3. What is done (built and committed on `dev`)

By stream, with backlog ids. Whether a row is Done in the sheet depends on its
"Done when"; check the sheet.

- **S (setup):** Next.js app, Supabase with row-level security, Inngest,
  demo accounts, service checks. Six services checked on the live site.
- **A (agents and data):** page fetcher (A1), member import (A2), normaliser
  and quote check (A3, A4), profiler with thin rule (A5, A6, A8), collectors
  (A9 to A13, A25, A26), tags and embeddings (A14), matcher (A15, A18, A22),
  judge (A16), week cards (A17), cached mode and source status (A19), link
  checker (A20), evals and the gold-profile export (A21, A7 export), schedules
  and profile refresh (A23), cost script (A24), trend analyst (A27),
  connection finder (A28). The judge and card jobs are registered in
  `lib/inngest/functions/index.ts`.
- **B (Scout and Copilot):** Scout search (store by embedding, bilingual
  keyword fallback), research loop, checked brief, job, routes and two
  pre-run briefs (B1, B3, B4, B15); one real run through `/api/scout` and
  Inngest took 36 s (21:40), every step under 30 s. Copilot scope policy,
  classifier, tools, assistant, output check, chat route and staff handoff
  (B2, B5 to B10). 44 red-team cases (B11) and their runner
  `npm run eval -- red_team` (B12): 41 of 44 at 22:07, fixed, then 44 of 44
  at 22:14 and 22:20, stored in `eval_runs` (B16 fixes). Prompt-injection
  demo (B13); more privacy tests (B14), 17 of 17 stored in `eval_runs` at
  20:36.
- **C (screens):** design system and app shell (C1, C2), Your week and its
  buttons (C3, C4), profile screen, evidence and editor (C5, C6, C7), the job
  chain after a profile edit or re-rank with the cards moving on `/week`
  (C8; on Techinova the cards were rebuilt 7.5 s after a priority switch and
  27 s after a text edit), compare (C9), Scout screen (C10), Copilot screen
  and side panel on every member page (C11), Trust report (C12), data status
  (C13), explorer, testbed map and timeline (C14, C15, C16), ecosystem map
  (C17), digest email (C18). Swedish interface part one (C19, 23:19): the
  "English / Svenska" switch, shell, sign-in, profile, staff and shared
  pieces. Loading, empty and error states, accessibility and one data label
  rule on most screens (C20, D20).
- **Judge and cards after the model switch:** "Not open yet" label on cards,
  with such calls only filling a week that has fewer than five open items.
  The judge prompt was tightened (commit `97013d0`) because the new model
  kept 92 % of ranked public rows under the old rule (1,027 of 1,120,
  matching eval 22:28), some clearly unrelated.
- **Profiler injection guard:** a quote found only inside text that looks like
  instructions to an AI fails the quote check (`lib/profiler/injection.ts`).
  The stored profiles were made before it.
- **Evals:** matching eval (counts per mode for the Trust report),
  red-team eval, privacy row; `npm run eval` was last run at 22:28.
- **D (evidence and pitch):** timed-test key draft and record sheet (D5),
  staff-session sheets (D7) and the result-file shapes for both
  (`data/timed-test/README.md`, `data/staff-session/README.md`), Playwright
  walk-through `npm run e2e` (D13: 28 passed, 2 failed on one finding, fixed,
  `e2e/RESULTS.md`; later, against a local production build, 30 passed, 0
  failed, 2 Copilot steps skipped, commit `5115577`), prepared jury answers
  (D16), solution explainer (D18), README and
  handover (D17), drafts of the pitch deck (D15), the demo script (D14) and
  the quality-and-boundaries document (D19), the team checklist, and the
  deploy checklist (`docs/deploy-checklist.md`, with the result files traced
  for Netlify in `next.config.ts`).
- **Model choice:** benchmark of 13 free models; both slots switched to
  `nvidia/nemotron-3.5-super-vl-120b-a12b` on 2026-11-14 at 21:56.

---

## 4. In flight at about 23:30 on 2026-11-14

Numbers about matches, cards, tags and link health are not final until the
first item is done.

- **Second re-judge.** Every match is being judged again with the tightened
  judge prompt. At 23:24, 517 of 1,120 ranked public rows and 500 of 1,120
  personal rows had been judged again (145 and 136 rejected). Then the week
  cards, `npm run eval` and `npm run check:links` are run again. The cards in
  the database (327 for 56 members, week of 9 Nov) were built at 22:27,
  before it. The last link check (22:29) found 184 of 186 links ok and 2
  broken. `[UPDATE AFTER RE-JUDGE]`
- **In the working tree, not committed** (check `git status` and `git log`
  for what has landed since):
  - Scout's live search of the funders' own sites (EU Funding & Tenders,
    Vinnova, Energimyndigheten; `lib/scout/live-sources.ts`) and a keyed web
    search (Tavily or Brave, only when a key is set; `lib/scout/web-*.ts`).
  - The connection finder rewritten for the new model (`lib/connections/`):
    each side must name what it brings. The 6 stored pairs are from 18:55,
    with the earlier model.
  - EU Funding & Tenders topic links and the link classifier
    (`lib/collectors/eu-funding/`, `lib/links/classify.ts`).
  - The "Hand-entered" label on "Your week" cards (the committed card still
    says "Simulated data"), and the Swedish interface for Explore and Scout.
    The Copilot, the Trust report, "Your week" and the digest are still
    English only in the committed code.
  - A browser test of the cards moving after a priority switch
    (`e2e/rerank.spec.ts`, on Techinova, only with `E2E_RERANK=1`) and a
    site-wide e2e file.
  - A dry audit of the profiler and the tagger, old model against new
    (`docs/profiler-tagger-audit.md`, unfinished): it is to decide whether to
    re-profile with the new model.
  - These docs (`docs/*.md` brought up to date with the evening's work).

---

## 5. What is open

Measure (no result yet, 23:30 on 2026-11-14):

- A7 / A21: the team fills in `data/gold-profiles/*.json` ("right" or
  "wrong" per claim), then `npm run eval`. Do it after the last profiling run
  of the gold members: a new run resets the verdicts. 0 of 23 checked at
  22:28.
- D7: the staff session with the printed sheets; results go in
  `data/staff-session/results.json` (shape in `data/staff-session/README.md`).
  It is also the first rating of the judge's keep/reject line by people.
- D5: the timed test. The answer key is a draft: the team must confirm it
  before the first tester. Results go in `data/timed-test/results.json`
  (shape in `data/timed-test/README.md`).
- A23: a scheduled run seen in the Inngest history (needs the merge to
  `main`, or a local Inngest server running at 03:00).
- B13: re-run `npm run injection:demo` with the new model. The recorded run
  (20:49) is from the lightning model and from before the profiler's guard.

Still on the earlier model (`nvidia/nemotron-3.5-lightning-30b-a3b`), not
redone: every company profile (afternoon), the 6 connections (18:55), the
injection demo (20:49) and the two Scout pre-run briefs (20:51, 20:55).
Whether to re-profile is open (see the audit above).

Build or decide:

- Before the merge: follow `docs/deploy-checklist.md`. The one-line tracing
  fix in `lib/trust/load.ts` it asks for is in (commit `9cf3b3d`, 23:27). The
  merge itself only when the owner says so, in that moment.
- `BSP_CONTACT` in `lib/copilot/policy.ts` is a placeholder until BSP says
  how members reach its staff.
- Copilot turns do not record tokens; `npm run cost` shows calls only. Its
  judge line adds up every recorded judge run, re-judges included, so the
  "everything once" total over-counts.
- The digest has no member email list and no verified Resend domain, so it
  goes to one named address and only to the Resend account owner.
- Open questions for the owner: re-profile every member with the new model?
  Delete the 15 old fixture opportunities? Add billing to Voyage (3 requests
  a minute without)? When to merge `dev` to `main`?

---

## 6. Things that bit us (do not rediscover them)

- Netlify cuts a request, and so a job step, off at 30 s. Inngest runs with
  `checkpointing: false` so every step is its own request; model calls use a
  26 s timeout.
- Import `cheerio/slim`, never `cheerio`: the main entry loads its own undici,
  which takes over Node's fetch and now and then crashes the process.
- Thinking stays off (Haiku `{type: "disabled"}`, Sonnet
  `{type: "between_tools"}`): every prompt and time limit was tuned without
  it, and on Nemotron calls with it ran past the step limit.
- Quotes are never translated: the quote check compares them word for word
  with the page.
- Claude's rate limits are the account's tier limits; the SDK retries a 429
  itself, then scripts wait a minute and try again (NVIDIA answered 429 at
  roughly 30 to 45 requests a minute). Voyage without billing: 3 requests a minute.
- Type invisible characters as escapes (`\u200B`), never literally, and check
  the saved file.
- A foreground `sleep` is blocked in the agent harness: use a background
  command or a loop with a condition.
- ESLint and Vitest ignore `.claude/**` on purpose (agent worktrees).
- In the local Inngest dev server a run is finished when `ended_at` is set;
  its `status` says "Completed" too early.
- The hosted database's session pooler allows 15 clients. With a re-judge and
  other scripts running, a read-only script can fail with `EMAXCONNSESSION`
  (seen at 23:21 on 2026-11-14): wait and run it again.

---

## 7. Checks before every commit

```bash
npm run typecheck
npm run lint
npx vitest run
```
