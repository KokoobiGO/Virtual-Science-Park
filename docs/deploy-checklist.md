# Deploy checklist: merge `dev` into `main`

For the project owner. `main` deploys to Netlify on every push and the build
credits are low, so the plan is one merge, one build, and checks before and
after. Written 2026-11-14, late evening, from a local production build of
`dev` (the working tree of that moment, with the other evening changes
still uncommitted).

The live site is https://jade-kashata-27a74f.netlify.app. `main` is at
`07a88cd` (the A5 profiler prompt, 14 Nov 16:13); `dev` is 37 commits ahead
and `main` is an ancestor of `dev`, so the merge is a fast-forward.

## 1. Act on these first

1. **Fix one line in `lib/trust/load.ts` before the merge.** `next build`
   warns "Dynamic filesystem access causes tracing of the whole project" at
   `readFile(path.join(process.cwd(), relativePath))` (line 71). Because of
   it the `/trust` function carries every file of the repo: 726 files and
   8.8 MB in the trace, 514 of them our own sources, docs, scripts, tests,
   e2e files and the git-ignored digest previews, instead of about 213. It
   is a warning, not a failure, but the fix is one comment:

   ```ts
   return await readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), relativePath), "utf8");
   ```

   Tried on a scratch copy of the tree: the warning is gone, the `/trust`
   trace drops to 213 files (3.2 MB), and `data/timed-test/results.json` and
   `data/staff-session/results.json` (made from the example files for the
   test) are still traced. A build with Netlify's packaging
   (`NEXT_PRIVATE_STANDALONE=1`) then ships exactly three files from
   `data/`: those two and `data/injection-demo/result.json`.
2. **Check the Netlify environment variables** (in Netlify: Site
   configuration, then Environment variables) against the table in
   section 3. What a morning setup may have wrong for tonight's code:
   - `INNGEST_DEV` must not exist on Netlify.
   - `ANTHROPIC_API_KEY` must be set: since 2026-11-15 every model call goes
     to Claude (`lib/model.ts`). The old `NVIDIA_API_KEY`, `NVIDIA_API_BASE_URL`,
     `NVIDIA_MODEL_FAST` and `NVIDIA_MODEL_MAIN` are no longer read and can be
     deleted.
   - `DEMO_MODE` should be absent or `live` (see section 3).
   - `APP_URL` must be the live URL: the digest email's links use it (new
     since the morning; empty means links to http://localhost:3000).
3. **Database connections may run out.** The hosted database is reached
   through Supabase's session pooler, which allows 15 clients at once. Each
   server process opens up to 5 (`lib/db/index.ts`, `max: 5`) and keeps them
   open. Tonight's local test runs failed with `EMAXCONNSESSION max clients
   reached in session mode - max clients are limited to pool_size: 15` while
   the team's dev server and other runs were connected; one file at a time
   they passed. On Netlify every warm function instance and every job step
   holds its own clients, on top of the team's machines. Recommended (not
   tried on Netlify): set Netlify's `DATABASE_URL` to the **transaction
   pooler** string of the same project (Supabase > Connect > Transaction
   pooler, port 6543). The code already works with it: `prepare: false`,
   and the user client sets its role and claims per transaction
   (`set local`, `set_config(..., true)`). Keep the session pooler in
   `.env.local` for `npm run db:migrate`.
4. **The nightly jobs start running once Inngest is re-synced** (section 6),
   on the hosted database, with the Claude key (paid per token): collect 03:00, enrich
   03:30, match 04:30 (which may judge and rebuild cards), heartbeat 06:00
   every day; profile refresh 04:00, trend notes 05:00 and week cards 06:00
   on Mondays (the first Monday is 16 Nov). A local `npm run inngest:dev`
   left running overnight may fire the same schedules against the same
   database: stop it at night.

## 2. What was checked locally (2026-11-14, 22:30 to 23:20)

- **Production build** (`npm run build`, Next.js 16.4.6 with Turbopack):
  passes in 16 to 29 s. Run four times; one run failed on another
  helper's half-written `lib/i18n/translate.ts` and passed once that file
  was finished. TypeScript passes. The only warning is item 1 above.
- **Routes:** 18 pages, all `◐` partial prerender (a static shell, the
  signed-in parts stream in): `/`, `/_not-found`, `/sign-in`, `/design`,
  `/demo/injection-test`, `/week`, `/profile`, `/profile/[slug]`,
  `/explore`, `/scout`, `/copilot`, `/trust`, `/sources` and the five
  `/staff/*` pages. 15 API routes `ƒ` (on demand), and the proxy `ƒ` (Node.js
  runtime). No page is fully static and none failed prerendering: every
  cookie, session and database read is inside a Suspense boundary.
- **Bundle sizes:** browser JavaScript 1.3 MB in 41 files, the largest
  235 KB (React); CSS 69 KB. Each server route traces 170 to 215 files
  (2 to 4 MB), apart from `/trust` (item 1). Nothing else stands out.
- **Files read from disk at request time:** only two places.
  `app/staff/injection-demo/load.ts` reads `data/injection-demo/result.json`
  and `lib/trust/load.ts` reads `data/timed-test/results.json` and
  `data/staff-session/results.json` (these two do not exist yet; the page
  then says "not measured yet"). `next.config.ts` now names all three in
  `outputFileTracingIncludes` for `/staff/injection-demo` and `/trust`; the
  build traces them (checked in the `.nft.json` files). Everything else under
  `data/` (`testbeds.seed.json`, `series-events.json`,
  `regional-funding.json`, the Scout pre-run briefs) and every collector's
  `recorded.json` is imported, so it is bundled into the code (checked in
  the `/api/inngest` chunk). The jobs read no files.
- **Smoke test of the built app** (`next start -p 3100`, GET requests,
  signed in through Supabase as `embeddedart@` and `staff@`): 41 of 41
  checks passed. Signed out: `/`, `/sign-in`, `/design`,
  `/demo/injection-test` and `/api/inngest` answer 200, every protected page
  redirects to `/sign-in?next=...`, an unknown page is 404. Member and staff
  pages answer 200 with content (cards on `/week`, the recorded run on
  `/staff/injection-demo`), the wrong role is redirected, and
  `/api/staff/compare` answers 401, 403 and 200 as it should.
- **Playwright walk-through against the built app**
  (`BASE_URL=http://localhost:3100 E2E_SKIP_COPILOT=1 npm run e2e`):
  **30 passed, 2 skipped** (the two Copilot questions), 0 failed, 50 s.
- **Unit and integration tests** (`npx vitest run`): the unit tests pass.
  Integration tests failed on database connections (item 3); one file at a
  time 1106 passed and 1 failed, a Copilot tools test that needs Malvacom
  to have a kept match EmbeddedArt lacks (the data was being re-judged).
- A local `next build` does not disturb a running `next dev`: Next 16 keeps
  the dev server's files in `.next/dev` and the build leaves that folder
  alone.

Not checked, because it needs the deploy: the Netlify build itself (Node 24
from `.nvmrc`; locally Node 22.13), the proxy as a Netlify edge function,
the 30 s cut-off, Inngest Cloud calling the jobs, and the Netlify
environment variables.

## 3. Environment variables on Netlify

Names only; the values are in the team's `.env.local` and in Netlify. Set
them for all deploy contexts and scopes (builds and functions):
`NEXT_PUBLIC_*` are put into the browser code at build time.

| Name | Needed on the deployed site? | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (build and runtime) | sign-in, every page |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (build and runtime) | sign-in, every page |
| `DATABASE_URL` | Yes | every page (as the signed-in user) and every job |
| `ANTHROPIC_API_KEY` | Yes | Copilot, Scout, every model job, `/staff/checks` |
| `VOYAGE_API_KEY` | Yes | enrich job, Scout's store search (falls back to keywords without it) |
| `INNGEST_EVENT_KEY` | Yes | every button and edit that starts a job; `/staff/checks` |
| `INNGEST_SIGNING_KEY` | Yes | `/api/inngest` (Inngest Cloud calls), `/staff/checks` run results |
| `APP_URL` | Yes, the live URL | links in the digest email (new reader since the morning) |
| `RESEND_API_KEY` | Yes, for the digest | `app/digest.requested`, `/staff/checks` |
| `INNGEST_DEV` | **Must be absent** | with `1` the app sends events to a local dev server and `/staff/checks` says so |
| `DEMO_MODE` | Optional: absent or `live` | `cached` makes the nightly collectors use the recorded copies, page fetches use stored pages, and Scout answer the two pre-run questions from `data/scout-briefs/`. Only for a deliberate offline demo |
| `SCOUT_MAX_SEARCHES` | Optional | searches per Scout brief, 1 to 20; default 6 (the morning `.env.example` said 8; both work) |
| `ANTHROPIC_API_BASE_URL`, `VOYAGE_BASE_URL`, `VOYAGE_MODEL`, `INNGEST_API_BASE_URL` | Optional, leave empty | defaults are in the code |
| `DEMO_USER_PASSWORD` | No | scripts and the e2e suite only (harmless if present) |
| `SUPABASE_SECRET_KEY` | No | scripts and tests only (`npm run db:demo-users`, `check:services`) |
| `NVIDIA_API_KEY`, `NVIDIA_API_BASE_URL`, `NVIDIA_MODEL_FAST`, `NVIDIA_MODEL_MAIN` | No | no longer read since 2026-11-15; delete them |
| `COPILOT_LIVE`, `BASE_URL`, `E2E_SKIP_COPILOT` | No | tests on your machine only |

Netlify needs a redeploy after a variable changes. Change variables before
the merge, so the one build picks them up.

## 4. The 30-second limit

Netlify's documentation gives synchronous functions 60 s, but this site
measured a 504 at 30.0 s on 2026-11-14 (`lib/inngest/client.ts`), so the
app is built for 30 s per request:

- **Jobs (Inngest).** `/api/inngest` runs one step per request
  (`checkpointing: false` in `lib/inngest/client.ts`), and every model call,
  search and page read is its own step. Model calls in jobs time out at 26 s
  (`lib/scout/agent.ts` `MODEL_TIMEOUT_MS`; thinking is off, see README "Claude
  API"). A step cut off at 30 s is retried by Inngest.
- **Copilot (`POST /api/chat`).** One turn has a 23 s budget
  (`TURN_BUDGET_MS` in `lib/copilot/turn.ts`), at most 12 s per model call,
  3 tool rounds of 3 calls; the answer streams as server-sent events.
- **Scout.** `POST /api/scout` only stores a row and sends an event; the run
  is the `scout-brief` job (steps as above, whole run under 300 s); the page
  polls `GET /api/scout/<id>` every 2 s, each a short database read.
- **Service checks.** "Run Inngest check" waits at most 24 s for the
  heartbeat run (`lib/inngest-checks.ts`).

## 5. Merge and push (the one build)

Before:

1. Section 1 done; `git status` on `dev` clean; everything committed and
   pushed (`git push origin dev`).
2. On `dev`: `npm run typecheck`, `npm run lint`, `npx vitest run` pass, and
   `npm run build` passes with no Turbopack warning.
3. No commit message between `main` and `dev` contains `[skip netlify]`
   (check: `git log --format=%s origin/main..origin/dev | grep -i skip`
   prints nothing), or Netlify skips the build.

The merge, from the repo folder in Git Bash, without switching branches:

```bash
git fetch origin
git push origin origin/dev:main
```

This fast-forwards `main` to `dev`. Git refuses it if `main` has a commit
`dev` does not have; then stop and ask.

## 6. Watch the build, then re-sync Inngest

In Netlify > Deploys, open the new deploy's log. Look for:

- `Next.js 16.4.6 (Turbopack)` and "Cache Components enabled".
- No `Failed to type check` and no `Error occurred prerendering page`.
- No `Warning: Dynamic filesystem access` (section 1, item 1).
- The route table: every page `◐` (partial prerender), every `/api/*` route
  `ƒ`, and `ƒ Proxy (Middleware)`.
- The Next.js runtime step bundles the server handler function and the
  proxy as an edge function, then "Site is live".

When the deploy is live, re-sync Inngest so it knows every job and schedule:

```bash
curl -X PUT https://jade-kashata-27a74f.netlify.app/api/inngest
```

It answers `Successfully registered` (or a JSON body saying the app was
synced). Then `curl https://jade-kashata-27a74f.netlify.app/api/inngest`
should show `"mode":"cloud"`, `"has_event_key":true`,
`"has_signing_key":true` and `"function_count":18`.

In the Inngest dashboard (production environment, app
`virtual-science-park`) there should now be 16 functions plus 2 failure
handlers (18 in total); the morning's `profile-preview` is gone:

| Function | Trigger | Schedule (Europe/Stockholm) |
| --- | --- | --- |
| `heartbeat` | `app/heartbeat.requested` | daily 06:00 |
| `fetch-snapshot` | `app/snapshot.requested` | |
| `import-members` | `app/members.import.requested` | |
| `profile-company` (+ failure handler) | `app/company.profile.requested` | |
| `profile-all-members` | `app/members.profile.requested` | |
| `collect-sources` | `app/sources.collect.requested` | daily 03:00 |
| `enrich` | `app/enrich.requested`, `app/company.embed.requested` | daily 03:30 |
| `match-companies` | `app/match.requested`, `app/company.profile.changed` | daily 04:30 |
| `find-connections` | `app/connections.requested` | |
| `trend-notes` | `app/trends.requested` | Mondays 05:00 |
| `refresh-profiles` | `app/members.refresh.requested` | Mondays 04:00 |
| `judge-company` | `app/company.judge.requested` | |
| `judge-all` | `app/judge.requested` | |
| `build-week-cards` | `app/cards.requested` | Mondays 06:00 |
| `send-digest` | `app/digest.requested` | |
| `scout-brief` (+ failure handler) | `app/scout.requested` | |

## 7. Open the live site

Signed out:

1. https://jade-kashata-27a74f.netlify.app/ and `/sign-in` open.
2. `/demo/injection-test` opens (the planted test page).
3. `/week` sends you to `/sign-in?next=%2Fweek`.

As `embeddedart@demo.vsp.test` (password: the team's `DEMO_USER_PASSWORD`):

4. `/week` shows cards; `/profile`, `/explore` (list, Timeline, Map),
   `/scout`, `/copilot`, `/trust`, `/sources` open without an error box.
5. Ask the Copilot "Which test facilities could we use for an underwater
   sensor?": an answer with sources in about 6 to 20 s, not a timeout.
6. On `/scout`, open a stored brief from "Your briefs".

As `staff@demo.vsp.test`:

7. `/staff/compare`, `/staff/ecosystem`, `/staff/handoffs`, `/trust` open.
8. `/staff/injection-demo` shows the recorded run, **not** "No run recorded
   yet". That proves `data/injection-demo/result.json` shipped with the
   function.
9. `/staff/checks`: "Run Inngest check" passes (the heartbeat runs in
   Inngest Cloud); "Run Claude checks" and "Run Voyage check" pass.

## 8. Run the walk-through against the live site

From the repo folder in Git Bash (it reads `DEMO_USER_PASSWORD` from
`.env.local`):

```bash
BASE_URL=https://jade-kashata-27a74f.netlify.app E2E_SKIP_COPILOT=1 npm run e2e
```

In PowerShell:

```powershell
$env:BASE_URL = "https://jade-kashata-27a74f.netlify.app"; $env:E2E_SKIP_COPILOT = "1"; npm run e2e
Remove-Item Env:BASE_URL, Env:E2E_SKIP_COPILOT
```

Then `npm run e2e:report` opens the report. The suite saves and unsaves one
card and signs in through the form; it never signs out. Leave out
`E2E_SKIP_COPILOT=1` for one run with the two Copilot questions (real model
calls, two stored chat turns). This run is the "green run on the deployed
URL" of backlog D13.

## 9. Roll back

Fastest, no build credit: in Netlify open Deploys, then the last deploy of
`07a88cd`, then "Publish deploy". The old version is live again at once. Then re-sync
Inngest against it, so Inngest Cloud drops the new jobs and their crons
(until then it calls jobs the old deploy does not have, and they fail):

```bash
curl -X PUT https://jade-kashata-27a74f.netlify.app/api/inngest
```

`main` still points at the new commit after that; leave it. Fix the problem
on `dev` and merge again (one more build). If Netlify shows that auto
publishing is stopped after the rollback, start it again before that merge,
or the fixed build will not go live.
