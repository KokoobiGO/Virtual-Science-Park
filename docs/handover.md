# Handover: Virtual Science Park

Written 2026-11-14, about 22:00 Swedish time. It replaces the earlier
`HANDOFF.md` (written at 19:50 the same day; its full text is in git history).

`README.md` is the reference for how each part works and how to run it. This
file is the state of the work: what is done, what is open, and the rules.

---

## 1. Rules (they override defaults)

1. **Never open, read, print or search any `.env` file**, including
   `.env.local`. Only `.env.example` may be read. To learn whether a key
   works, run `npm run check:services` or `npm run check:nvidia`: they load
   `.env.local` themselves and print PASS or FAIL without values. Never ask
   anyone to paste a secret into a chat. Pass this rule to every helper.
2. **Work on `dev` only.** `main` deploys to Netlify on every push and the
   build credits are low. Do not push or merge to `main` unless the project
   owner says so. After a merge: one build, then
   `curl -X PUT https://jade-kashata-27a74f.netlify.app/api/inngest`. A commit
   message with `[skip netlify]` skips a build.
3. **The backlog sheet is the scoreboard.** Google Sheet "Virtual Science
   Park — Backlog", tab `Backlog` (the sheet id is not kept in this public
   repo: ask the owner). A row is set to Done only when its "Done when" has
   been shown to work on the real thing. Built but unproven rows stay as they
   are, with the reason said.
4. **Keep it simple.** The shortest working path; exact click-by-click steps
   when someone must act in a dashboard; proof on the real system.
5. **Orchestrator and executors.** The main session plans, briefs, reviews and
   commits; executors (`.claude/agents/opus-executor.md`) build and do not
   commit or push.
6. **NVIDIA's free API only.** The project owner decided on 2026-11-14 not to
   use Claude. Both model slots use `nvidia/nemotron-3.5-super-vl-120b-a12b`
   (`lib/nvidia.ts`, `docs/model-choice.md`).
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
| Branches | `dev` (all current work), `main` (deployed, at `07a88cd`: the A5 profiler prompt, far behind `dev`) |
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
- **B (Scout and Copilot):** Scout search, research loop, checked brief, job,
  routes and two pre-run briefs (B1, B3, B4, B15); Copilot scope policy,
  classifier, tools, assistant, output check, chat route and staff handoff
  (B2, B5 to B10); 44 red-team cases (B11) and their runner in
  `npm run eval -- red_team` (B12); prompt-injection demo (B13); more privacy
  tests (B14).
- **C (screens):** design system and app shell (C1, C2), Your week and its
  buttons (C3, C4), profile screen, evidence and editor (C5, C6, C7), the job
  chain after a profile edit or re-rank (C8), compare (C9), Scout screen
  (C10), Copilot screen (C11), Trust report (C12), data status (C13),
  explorer, testbed map and timeline (C14, C15, C16), ecosystem map (C17),
  digest email (C18).
- **D (evidence and pitch):** timed-test key draft and record sheet (D5),
  staff-session sheets (D7), Playwright walk-through `npm run e2e` (D13),
  prepared jury answers (D16), solution explainer (D18), this README and
  handover (D17); a pitch deck and a quality-and-boundaries document in
  `docs/`.
- **Model choice:** benchmark of 13 free models; both slots switched to the
  super-vl model on 2026-11-14 evening.

---

## 4. In flight on 2026-11-14 evening

- The orchestrator is re-tagging and re-judging every match with the new
  model, then rebuilding the week cards. Counts of tags, judged, kept and
  rejected matches and week cards change for about an hour. Read them again
  afterwards (`/trust` as staff shows the matching counts).
- A wave of executors worked in the same tree at the same time on 2026-11-14
  evening. Their work (the C8 job chain, the testbed map, the red-team runner
  and the matching eval, the e2e walk-through, a Copilot launcher on member
  pages, error pages, Scout's bilingual keyword search, the profiler's
  injection guard, an idempotency key on the digest send) was uncommitted
  when this file was written. Check `git log` for what was committed.

---

## 5. What is open

Measure (nothing below has a result yet, 2026-11-14):

- A7 / A21: the team fills in `data/gold-profiles/*.json` ("right" or
  "wrong" per claim), then `npm run eval`. Do it after the last profiling run
  of the gold members: a new run resets the verdicts.
- D7: the staff session with the printed sheets; results go in
  `data/staff-session/results.json` (shape in `results.example.json`).
- D5: the timed test. The answer key is a draft: the team must confirm it
  before the first tester. Results go in `data/timed-test/results.json`.
- B11, B12: the red team ran once, 2026-11-14 22:07 Swedish time
  (`eval/redteam-last-run.json`): 41 of 44 passed. Check that a full run is
  stored in `eval_runs` for the Trust report, fix the 3 failures, run again.
  A privacy test run stored for the report is still to do.
- A23: a scheduled run seen in the Inngest history (needs the merge to
  `main`, or a local Inngest server running at 03:00).
- B13: re-run `npm run injection:demo` with the new model (the recorded run is
  from the lightning model).

Build or decide:

- `next.config.ts` needs `outputFileTracingIncludes` for the JSON files that
  `/trust` and `/staff/injection-demo` read at request time, before the merge.
- The job chain after a profile edit or a re-rank (re-embed, rank, judge,
  cards; C8, in `lib/inngest/functions/` on 2026-11-14 evening) needs one
  real end-to-end run: edit a demo member's profile text and check that its
  ranking and cards change.
- `BSP_CONTACT` in `lib/copilot/policy.ts` is a placeholder until BSP says
  how members reach its staff.
- Copilot turns do not record tokens; `npm run cost` shows calls only.
- The Trust report's fixed "Known limits" text (`lib/trust/report.ts`) still
  names the lightning model.
- The digest has no member email list and no verified Resend domain, so it
  goes to one named address and only to the Resend account owner.
- Open questions for the owner: delete the 15 old fixture opportunities? Add
  a "hand-entered" state so real regional offers are not shown as
  "simulated"? Add billing to Voyage (3 requests a minute without)? When to
  merge `dev` to `main`?

---

## 6. Things that bit us (do not rediscover them)

- Netlify cuts a request, and so a job step, off at 30 s. Inngest runs with
  `checkpointing: false` so every step is its own request; model calls use a
  26 s timeout.
- Import `cheerio/slim`, never `cheerio`: the main entry loads its own undici,
  which takes over Node's fetch and now and then crashes the process.
- Thinking must be off on Nemotron (`enable_thinking: false`), or calls run
  past the step limit.
- Quotes are never translated: the quote check compares them word for word
  with the page.
- NVIDIA answers 429 at roughly 30 to 45 requests a minute; scripts wait a
  minute and try again. Voyage without billing: 3 requests a minute.
- Type invisible characters as escapes (`\u200B`), never literally, and check
  the saved file.
- A foreground `sleep` is blocked in the agent harness: use a background
  command or a loop with a condition.
- ESLint and Vitest ignore `.claude/**` on purpose (agent worktrees).
- In the local Inngest dev server a run is finished when `ended_at` is set;
  its `status` says "Completed" too early.

---

## 7. Checks before every commit

```bash
npm run typecheck
npm run lint
npx vitest run
```
