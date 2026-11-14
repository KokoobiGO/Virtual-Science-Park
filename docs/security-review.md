# Security review

Reviewed on 2026-11-14 (evening), against the committed code on `dev` (HEAD
`44c9964` at the end of the review) and the team's hosted database through
`DATABASE_URL`, read-only or inside transactions that always roll back. No
request went to the live site, Netlify, Supabase's management API or another
outside service. Requests went to the local dev server (http://localhost:3000)
only. Nothing was changed in the application code.

The tests that prove or guard the findings are in `tests/security-*.test.ts`.
A test marked `it.fails` states the property we want and fails today because
of the hole, so Vitest counts it as an expected failure. When a fix lands,
that test turns red and must become a plain `it`.

## Summary

What holds:

- Every route handler and every server action that touches data checks the
  session on the server (`getViewer()`, which verifies the token with
  `getClaims()`), checks the role, and takes the company from the verified
  token, never from the request. An anonymous request to each of the 16 API
  route and method pairs got 401. A member got 403 on every staff route, and
  staff got 403 on every member route.
- No request path calls `getDb()`. An import-graph scan from every route,
  page, layout and action found it only behind `/api/inngest`, where Inngest
  runs the jobs.
- In production mode (no `INNGEST_DEV`), the Inngest SDK (4.26.2) refuses
  unsigned calls to `/api/inngest`.
- Row-level security is on for every table, every table has a policy, and no
  member reads another company's private rows. The existing privacy tests show
  this, and the guards in `tests/security-rls.integration.test.ts` hold.
- Model output is checked in code before anyone sees it. Outside text goes
  into the prompts as data blocks whose closing tags are made harmless. The
  Copilot tools only ever use the company from the token.
- No keys are in the code or the git history. `.gitignore` covers the env
  files, Playwright session files and digest previews. Only the Supabase URL
  and the publishable key reach the browser.

What does not hold:

- A member can forge a claim's source: a value that looks as if it was quoted
  from a web page, or a new value under a profiler claim's real quotes (F1).
- Anyone with only the public key can read the stored eval results. These
  include the red-team Copilot answers, with a demo member's personal matches
  in them, and the same text is committed to git (F2).
- The page fetcher's private-address check can be bypassed (F3).
- On the dev machines, the jobs can be called without a signature from the
  local network, with the database owner's rights against the hosted
  database (F4).
- The sign-in `next` parameter can send a user to another site (F5).
- An account with no role reads all the "signed-in only" data (F6). Whether
  anyone can create such an account on the hosted project is not checked.
- No rate limit or cap per member exists on any route that spends model calls
  (F7).
- Scout sends model-written search queries, built from the private profile,
  to outside search services (F8).

None is critical: no anonymous path reaches a member's own data or a staff
tool, and nothing outside the demo accounts was shown to leak.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | High | A member can forge where a claim came from (claims RLS) | Confirmed |
| F2 | High | `anon` reads `eval_runs`, which hold Copilot answers with personal matches; also in git | Confirmed |
| F3 | Medium | Fetcher SSRF: IPv4-mapped IPv6, `[::]`, 100.64/10, DNS names and rebinding pass | Confirmed locally |
| F4 | Medium | Dev: unsigned job calls from the LAN with owner rights; no production guard against `INNGEST_DEV` | Confirmed locally |
| F5 | Medium | Open redirect after sign-in: `next=/\evil.example` | Confirmed locally |
| F6 | Medium | An account with no role reads all public BSP data; sign-up may be open | RLS confirmed, sign-up setting suspected |
| F7 | Medium | No rate limit or cap per member on the routes that call models | Confirmed by reading |
| F8 | Medium | Scout sends queries built from the private profile to outside search | Confirmed by reading and by git history |
| F9 | Low | Member-writable rows the app and staff trust: chats, handoffs, briefs | Confirmed by reading |
| F10 | Low | The Copilot's `contactStaff` sends a message the model wrote | Suspected |
| F11 | Low | Anyone can re-sync `/api/inngest`, and the URL comes from the Host header | Suspected |
| F12 | Low | Fetcher reads the whole body before the size check; a missing content type passes | Confirmed by reading |
| F13 | Low | No security headers (frame-ancestors, nosniff, referrer policy) | Confirmed by reading |
| F14 | Low | One shared demo password for all four accounts, staff included; the accounts are listed on the public sign-in page | Confirmed by reading |
| F15 | Info | Smaller notes | |

### F1 (High): a member can forge where a claim came from

`drizzle/0002_rls.sql:111-113` (`claims_member_insert`) only checks
`company_id` and `updated_by = 'user'`. `drizzle/0002_rls.sql:116-119`
(`claims_member_update`) only checks `company_id`, for every column. So a
member can:

- insert a claim with `status = 'stated'` (the "Stated" badge, which means a
  value quoted from a web page) and any confidence;
- rewrite the `value` of a profiler claim. Its evidence rows stay attached, so
  the profile shows "Stated" with real page quotes that do not support the new
  value;
- relabel its own correction as `updated_by = 'profiler'`, `status = 'stated'`.

This is not limited to the screens. The `authenticated` role has INSERT and
UPDATE on `claims` (checked: `has_table_privilege` is true). The member's
access token sits in a cookie the page's JavaScript can read (`@supabase/ssr`
sets `httpOnly: false`). So from the browser console:
`PATCH {SUPABASE_URL}/rest/v1/claims?id=eq.<id>` with the publishable key and
`Authorization: Bearer <token>`. Staff, other members, the judge (public
mode), the connection finder and the eval all read these claims as profiler
output. It cannot reach another company's claims; that guard holds.

Evidence: `tests/security-rls.integration.test.ts`, "F1: a member can forge
where a profile claim came from". All three tests are expected failures:
inserting a claim marked 'stated', changing a profiler claim's value and
relabelling a correction all succeeded against the hosted database, then
rolled back.

Fix (a new migration, e.g. `drizzle/0005_claims_member_writes.sql`). The
editor only inserts `user_corrected` and `user_confirmed` claims with
confidence 1 (`lib/profile-view/edit.ts:103-112`), and only ever updates
`review_state` and `updated_at` (`app/profile/actions.ts:89-92,136-138`), so
nothing in the app breaks:

```sql
drop policy claims_member_insert on claims;
create policy claims_member_insert on claims
  for insert to authenticated
  with check (
    company_id = (select app.company_id())
    and updated_by = 'user'
    and status in ('user_corrected', 'user_confirmed')
    and confidence = 1
  );

-- Members only move their own claims between review states (supersede, accept, reject).
-- claims_member_update stays as it is and still checks the company.
revoke update on claims from anon, authenticated;
grant update (review_state, updated_at) on claims to authenticated;
```

After the migration, turn the three `it.fails` in that block into `it`.

### F2 (High): anyone with the public key reads the eval results, red-team answers included

`drizzle/0002_rls.sql:96-97` lets `anon` read `eval_runs`. The publishable
key is in every page's JavaScript, so this means anyone on the internet. The
`red_team` eval stores every Copilot answer in full in `details`
(`lib/eval/redteam.ts:142-143`, `details: { cases }` at `:220`). Those answers
are made as a demo member and include its personal matches (the privacy model
says "personal matches ... readable only by their own company"). The case
`privacy-06-follow-up` answers "Here are your top five matches right now"
for EmbeddedArt. The same file is committed as `eval/redteam-last-run.json`
(about line 1275).

Evidence:

- On the hosted database, `anon` read 13 `eval_runs` rows, including 3
  `red_team` rows with 132 stored cases; 2 of those rows contain
  personal-match answers (counts only, no text read).
- Test: `tests/security-rls.integration.test.ts`, "a signed-out visitor (anon,
  the public key alone) reads no eval results" (expected failure).
- I found none of the private demo claim's wording ("spring 2027", "Defence
  innovation funding") in `eval_runs` or anywhere outside the fixtures and
  tests.

Fix:

```sql
drop policy eval_runs_read on eval_runs;
create policy eval_runs_read on eval_runs
  for select to authenticated using ((select app.role()) in ('member', 'staff'));
revoke select on eval_runs from anon;
```

`/trust` reads as the signed-in user, so it keeps working. Also, in
`lib/eval/redteam.ts`, store `label`, `outcome`, the citation count and the
problems, but not `reply.text` (or keep the text only for failed cases, after
a check that it holds no personal match). Do the same for the JSON file, and
take the answer text out of `eval/redteam-last-run.json`. If the GitHub
repository is or becomes public, the text stays in its history. It is demo
data, but say so in the privacy section.

### F3 (Medium): the fetcher's private-address check can be bypassed (SSRF)

`lib/fetcher/fetch-page.ts:28-51` (`publicHttpUrl`) checks the host name as
text and never looks at the address it resolves to. These pass:

- `http://[::ffff:127.0.0.1]/`, `http://[::]/`, `http://[::ffff:a9fe:a9fe]/`
  (the metadata address) and `http://[::ffff:10.0.0.1]/`;
- `100.64.0.0/10`;
- any public DNS name that points at a private address (for example
  `localtest.me` resolves to 127.0.0.1);
- DNS rebinding: one answer at the check, another at the fetch.

Redirects are checked with the same function (`:90-93`), so any page we fetch
can redirect into these. Who can supply a URL:

- staff, through `/api/snapshots`;
- every member company, because the profiler fetches its website and follows
  its redirects (`lib/inngest/functions/profile-company.ts:130`);
- the collectors' sources;
- Scout's search results, from the store, the live sources and the trusted
  web domains.

The text of a fetched page is stored in `snapshots`, which every signed-in
user can read in full through the REST API (`snapshots_read`,
`drizzle/0002_rls.sql:87-88`). Its first 600 characters are also returned to
staff (`lib/inngest/functions/fetch-snapshot.ts:52`). On Netlify (AWS Lambda)
there is little on the loopback, and JSON answers are refused by the
content-type check (`:97-100`). So the production impact is bounded, but the
guard does not do what it says.

Evidence:

- Run locally on 2026-11-14: `fetchPage("http://[::ffff:127.0.0.1]:3000/sign-in")`
  and `fetchPage("http://[::]:3000/sign-in")` both returned HTTP 200 with the
  local sign-in page.
- Tests: `tests/security-fetcher.test.ts`, five expected failures, and one
  guard for the forms that are refused today.

Fix: check the resolved address, and connect to exactly that address.

- Parse IP literals with `node:net` (`isIP`). Refuse loopback, private,
  link-local, CGNAT (100.64/10), 0/8, 192.0.0/24, 198.18/15, multicast and
  reserved (224/3), `::`, `::1`, `fc00::/7`, `fe80::/10` and `ff00::/8`. For
  `::ffff:0:0/96` and `64:ff9b::/96`, apply the IPv4 rule to the embedded
  address. A `net.BlockList` holds the ranges.
- Resolve names with `dns.lookup(host, { all: true })` and refuse when any
  address is blocked.
- Fetch with `node:https` / `node:http` and a `lookup` option that returns
  only the addresses already checked, so a second DNS answer cannot change
  the target.
- Keep re-checking every redirect hop.
- Then turn the five `it.fails` into `it`.

### F4 (Medium): on the dev machines, anyone on the network can run the jobs with owner rights

The team's `.env.local` sets `INNGEST_DEV=1` (README, "Run it locally") and
points `DATABASE_URL` at the hosted database (README, option B). In dev mode
the Inngest SDK skips the signature check: `validateSignature` returns success
when `client.mode !== "cloud"`
(`node_modules/inngest/components/InngestCommHandler.js:1456-1465`). Both dev
servers listen on every interface: port 3000 and port 8288 both on `::`
(checked with `Get-NetTCPConnection`).

Anyone on the same network (hackathon Wi-Fi) can therefore:

- POST to `http://<laptop>:3000/api/inngest?fnId=...` and run any job with
  their own event data, as the database owner against the real data. For
  example: `fetch-snapshot` with any URL (the preview comes back in the
  answer), `send-digest` to any address (Resend only delivers to the account
  owner today), `profile-company` or `judge-all`;
- open the Inngest dev UI on port 8288. It shows every run's input and
  output, including Scout briefs and judge output from private data, and lets
  them send any event.

Evidence:

- `GET http://localhost:3000/api/inngest` answered `"mode":"dev"`.
- An unsigned `POST /api/inngest?fnId=virtual-science-park-does-not-exist`
  got past the signature check and failed only at "Function ... was not
  found", with a stack trace. In cloud mode it is refused for a missing
  `X-Inngest-Signature`. No job was run.

In production the same hole opens if `INNGEST_DEV` is ever set on Netlify.
`inngestCloudProblem()` (`lib/inngest/runs.ts:30-35`) only warns the staff
tools.

Fix:

- `package.json`: `"dev": "next dev -H 127.0.0.1"` and
  `"inngest:dev": "inngest-cli dev --host 127.0.0.1 -u http://localhost:3000/api/inngest --no-discovery"`.
- `lib/inngest/client.ts`: pass
  `isDev: process.env.NODE_ENV !== "production" && process.env.INNGEST_DEV === "1"`,
  so a production build is always in cloud mode and checks signatures whatever
  the environment says.
- Prefer a local database for development with jobs running.

### F5 (Medium): open redirect after sign-in

`app/actions/auth.ts:16-21` accepts `next` when it matches `/^\/(?!\/)/`, then
calls `redirect(next)` (`:43`). `/\evil.example` and `/<tab>/evil.example`
match, and browsers read a backslash as a slash and drop tabs, so both land
on `evil.example`. A link like
`https://<site>/sign-in?next=%2F%5Cevil.example` signs the user in, then sends
them to a page that can ask for the password again.

Evidence:

- Run locally: a real sign-in through the form (no-JavaScript form post, demo
  member, signed out again afterwards) answered `303 Location:
  /\evil.example/landing`, which a browser resolves to
  `http://evil.example/landing`. The same happened with the tab form.
  `//evil.example` was correctly sent to `/week`.
- Tests: `tests/security-sign-in.test.ts`, two expected failures and two
  guards.

Fix (`app/actions/auth.ts`):

```ts
next: z
  .string()
  .regex(/^\/(?![\/\\])[^\\\u0000-\u001f]*$/)
  .optional()
  .catch(undefined),
```

Or resolve `new URL(next, "http://n")` and keep only `pathname + search` when
the origin is still `http://n`.

### F6 (Medium): an account with no role reads all "signed-in only" data

`companies_read`, `snapshots_read`, `opportunities_read`
(`drizzle/0002_rls.sql:84-91`), `claims_read` for public claims (`:106-108`),
`evidence_read` and `trend_notes_read` (`drizzle/0004_matching_tables.sql:60`)
allow any `authenticated` session. The app treats a session without
`app_metadata.role` as signed out (`lib/auth.ts:36-37`), but the REST API does
not.

Locally `supabase/config.toml:178` has `enable_signup = true` with email
confirmation off (`:229`). If the hosted project also allows sign-ups (the
Supabase default), anyone can create an account with the publishable key and
read every company, public claim, piece of evidence, full snapshot text and
opportunity. Today that was 56 companies, about 495 claims, 110 snapshots and
205 opportunities. It is public data from public pages, but the product says
"signed-in users".

Evidence: `tests/security-rls.integration.test.ts`, "an account with no role
in app_metadata (a self sign-up) reads no company data" (expected failure; it
read 56 / 495 / 110 / 205 rows). Not checked: the hosted sign-up setting (see
"Could not check").

Fix:

- Turn off "Allow new users to sign up" in the hosted project. Accounts are
  made by `scripts/demo-users.ts` with the secret key, so nothing needs it.
- Make the policies require a role:
  `create function app.has_role() returns boolean language sql stable as $$ select coalesce(app.role() in ('member','staff'), false) $$;`,
  then `using ((select app.has_role()))` on the read policies above. For
  `claims_read`, use
  `(visibility = 'public' and (select app.has_role())) or company_id = (select app.company_id())`.

### F7 (Medium): no rate limit or cap per member on the routes that call models

Every model call shares one free NVIDIA key, which answers 429 at about 30 to
45 requests a minute (README), and one Voyage key at 3 requests a minute.
Nothing limits a member:

- `POST /api/chat` (`app/api/chat/route.ts:23-37`): 3 to 6 model calls a
  turn, any number of turns, in parallel.
- Scout (`app/api/scout/route.ts:49-51`) allows one running brief per company.
  The check reads `briefs.status` (`lib/scout/queries.ts:121-132`), and the
  member can set that column itself through the REST API (`briefs_own` is
  `for all`, `drizzle/0002_rls.sql:164-167`). So: start a brief, mark it
  failed, start the next. Each brief is about 8 model calls and up to 3 paid
  web searches (Tavily or Brave, monthly quota).
- Profile edits, priority switches and "Useful" / "Not relevant"
  (`app/profile/actions.ts:53-59`, `app/week/actions.ts:77`) each start the
  chain of embed (Voyage and the tagger), rank, judge and cards.
  `match-companies` and the single-company `enrich` have no debounce
  (`lib/inngest/functions/match-companies.ts:78-83`,
  `lib/inngest/functions/enrich.ts:69-76`).

One member looping any of these starves every other member and the nightly
jobs. That is denial of service on a free key, and denial of wallet once a
key is paid.

Fix:

- Copilot: before a turn, count the company's `role = 'user'` chat rows from
  the last 10 minutes and the last day through `withUserDb`. Members can
  insert chats but never delete them, so the count cannot be reset. Answer
  429 above a small limit (for example 20 in 10 minutes, 150 a day).
- Scout: put the `companyId` from the session into the `app/scout.requested`
  event, and give `scout-brief` an Inngest `throttle` (or `rateLimit`) keyed
  on `event.data.companyId`, for example 6 an hour. Also
  `revoke delete on briefs from authenticated`; no member path deletes a
  brief.
- Jobs: add `debounce: { key: "event.data.companyId", period: "60s" }` to
  `match-companies` and to the single-company enrich trigger. Send the
  company id with `app/match.requested` from the feedback action, so one key
  covers both.

### F8 (Medium): Scout sends queries built from the private profile to outside search

The research model gets the company's personal profile text, including
private claims and priorities (`lib/scout/agent.ts:127-128`, `:501`). It
writes the search queries itself, and each query goes in parallel to the
store, the live sources (the EU Funding & Tenders search API and Vinnova's
site search) and, when a key is set, Tavily or Brave
(`lib/scout/agent.ts:374-386`). The progress lines stored with the brief
repeat the queries.

Commit `df9d2b0` removed such queries from `data/scout-briefs/embeddedart.json`
because they "repeated wording from a private (demo) claim". The cause is
still there. Only the stored copy was cleaned. The privacy model in the README
does not mention outside search.

Fix: send only the member's question and public-profile terms outside. Either
give the research loop `publicProfileText` and keep the private text for the
writer, or build outside queries in code from the question and the model's
`kind`, and keep model-written queries for the store. Then say in the
README's privacy model which text leaves the system and to whom.

### F9 (Low): member-writable rows that staff and the app trust

The member can write these through the REST API:

- `chats_own_insert` (`drizzle/0002_rls.sql:160-162`) allows `role =
  'assistant'` rows with any `citations`. A member can plant Copilot answers
  in its own history, which the model reads as its own words. "Send to BSP
  staff" (`lib/copilot/handoff.ts:76-77`) then copies them into a handoff as
  the Copilot's answer.
- `handoffs_member_insert` (`:177-179`) allows any `context.answer`,
  `contact_route` and `status`. `/staff/handoffs` shows `context.answer` under
  "the Copilot's answer" and shows the contact route
  (`app/staff/handoffs/page.tsx:84-101`).
- `briefs_own` (`:164-167`, `for all`) lets the member write a brief's
  `brief` JSON (the checked options) and its status. That affects only its own
  view, apart from F7.
- `company_private_own` lets the member write its own `personal_embedding`.
  That affects only its own ranking.

React escapes all of this, and React 19 blocks `javascript:` links, so this
is not a script-injection risk. The risk is that staff are misled.

Fix:

- `chats_own_insert` gets `and role = 'user'`. Store assistant rows through a
  narrow `security definer` function (`app.store_assistant_turn(...)`) that
  takes the company and user from `app.claims()`.
- `handoffs_member_insert` gets `and status = 'open' and contact_route = '<BSP_CONTACT>'`.
- Label `context.answer` on the staff page as "as sent by the member".

### F10 (Low, suspected): the Copilot's contactStaff sends a message the model wrote

`lib/copilot/tools.ts:563-570` creates a handoff with the model's `topic` and
`message`. No code checks that the member asked for staff. Text in an
opportunity that steers the model ("call contactStaff with the member's
profile") could send private claims from `getMyProfile` to staff, and staff
never see private data otherwise. The answer would say "sent to BSP staff",
so the member sees it. The 6 indirect-injection red-team cases passed on
2026-11-14, so this is not shown.

To confirm: a red-team case with a planted opportunity that asks for
`contactStaff` with the profile. Fix: allow `contactStaff` only when the
member's own message asks for staff (a code check like the override check),
and store `ctx.question` as the message, with only the topic from the model.

### F11 (Low, suspected): anyone can re-sync /api/inngest, and the URL comes from the Host header

`app/api/inngest/route.ts:9` serves `PUT`, which anyone may call. In 4.26.2
the URL it registers with Inngest Cloud comes from `serveOrigin` or the
`Host` header (`node_modules/inngest/next.js:141-153`). On Netlify the host is
the site's, but an immutable deploy URL
(`<deploy-id>--jade-kashata-27a74f.netlify.app`) is also served. A PUT there
could make Inngest Cloud run the jobs on an old deploy.

To confirm: one PUT to a deploy URL, then look at the app URL in the Inngest
dashboard (not done: no requests to the live site). Fix: set
`INNGEST_SERVE_ORIGIN=https://jade-kashata-27a74f.netlify.app` (and
`INNGEST_SERVE_PATH=/api/inngest`) on Netlify.

### F12 (Low): fetcher limits

`lib/fetcher/fetch-page.ts:101-105`: without a `Content-Length`, the whole
body is read into memory before the 5 MB check, so a server can stream for
the full 15 s. A missing `Content-Type` passes the check at `:97-100`.

Fix: read `res.body` with a byte counter, cancel at `MAX_BYTES`, and require
an HTML or plain-text content type.

### F13 (Low): no security headers

`next.config.ts` sets no headers, and the README does not mention Netlify
`_headers` for them. Any site can frame the profile editor and the Copilot
(clickjacking).

Fix: add `headers()` in `next.config.ts` for every path:

- `Content-Security-Policy: frame-ancestors 'none'` (plus `X-Frame-Options:
  DENY`);
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

A full script CSP needs nonces and can come later.

### F14 (Low): one demo password for every account, listed on the sign-in page

All four accounts, the staff account included, share `DEMO_USER_PASSWORD`
(`scripts/demo-users.ts:25`). `app/sign-in/page.tsx:47-58` lists the
addresses on the public page. Whoever gets the password for the demo has the
staff account too: handoffs, all public rankings, the service checks (which
spend quota) and the page fetcher (F3).

Fix before a public deploy:

- give staff its own password;
- rotate the password after the jury;
- show the account list only when `DEMO_MODE` is set.

### F15 (Info)

- The README says "The whole snapshot never reaches the browser". That is true
  of the screens, but any signed-in user reads full `snapshots.content_text`
  through the REST API (public pages, so this is wording, not a leak).
- `job_runs.stats` for Scout holds the company slug and brief id, so staff can
  see which member used Scout and when. Metadata only, no question text.
- In dev mode, error answers from `/api/inngest` include stack traces with
  local paths. Staff tools return Inngest API error text. Neither applies to
  members.
- Route handlers read JSON without checking `Content-Type`. Cross-site form
  posts are still stopped, because the Supabase cookies are
  `SameSite=Lax` and server actions check the Origin. Checking for
  `application/json` would be belt and braces.
- `lib/judge/prompt.ts:58` and `lib/week/ics.ts:116` contain literal
  invisible or combining characters where the repo's rule asks for `\u`
  escapes. Not a security issue.

## Checked and sound

- **Routes and actions.** All 14 route files under `app/api` other than
  `/api/inngest` (16 route and method pairs), plus the server actions in
  `app/profile/actions.ts` and
  `app/week/actions.ts`, call `getViewer()` and check the role.
  `app/actions/auth.ts` (sign-in and sign-out) and `app/actions/locale.ts`
  (the language cookie) need no session.
  - Anonymous calls answered 401.
  - A member got 403 on `/api/staff/compare`, `/api/snapshots`,
    `/api/members/import` and `/api/checks/*`.
  - Staff got 403 on `/api/chat`, `/api/chat/handoff`, `/api/scout` and
    `/api/week`.
  - Another company's or an unknown brief or chat answered 404.
  - The company always comes from `viewer.companyId`.
  - Inputs are checked with zod or by hand: uuids, lengths, enums, the event
    id pattern.
  - The staff tools from the morning (`/api/members/import`,
    `/api/snapshots`, `/api/checks/*`) are staff-only. An anonymous visitor
    cannot start a fetch or spend quota through them.
- **No `getDb()` on a request path.** The import-graph scan found
  `lib/sources/health.ts` and `lib/eval/matching.ts` imported from pages, but
  only their pure functions are called (`judgeSources`, and
  `countRankedMatches(tx)` with the user's transaction).
  `lib/scout/queries.ts` names `getDb()` only in a comment.
- **Inngest in production.** In cloud mode, `validateSignature` requires
  `X-Inngest-Signature` and the signing key. The proxy skips `/api/inngest`,
  which is correct because the SDK checks the signature itself.
- **Proxy and pages.** `/staff/*` pages call `requireRole("staff")`. `/week`,
  `/scout` and `/copilot` check for a member. The proxy is only a
  convenience, and the pages check again.
- **RLS.** Every table in `public` has RLS on and at least one policy.
  - Cross-company reads of private claims, private settings, matches, chats,
    briefs, saved items, feedback, handoffs and week cards are covered by
    `tests/privacy*.test.ts`.
  - The new guards show a member cannot move a claim to another company,
    change another company's claim, or write evidence, matches, week cards,
    companies or job runs.
  - `anon` reads no companies, claims or matches.
  - `job_runs` is staff-only, and `connections` is staff-only.
- **Output handling.**
  - The digest email escapes every database text and links only http(s)
    addresses (`lib/email/digest.ts:109-111,162-170,223-225`).
  - The `.ics` builder escapes TEXT values and makes a safe file name
    (`lib/week/ics.ts:31-37,113-121`).
  - The only `dangerouslySetInnerHTML` uses are a constant script
    (`components/html-lang-script.tsx`) and the planted comment on the demo
    page.
  - React 19 replaces `javascript:` in `href` on both server and client.
- **Secrets.**
  - A regex scan of the whole history for NVIDIA, Anthropic, Voyage, Resend,
    Inngest, Supabase secret and publishable keys, JWTs, AWS keys and Postgres
    URLs with passwords found only the local Supabase default
    (`postgres:postgres@127.0.0.1:54322`).
  - No `.env` file or session file was ever committed.
  - `.gitignore` covers `.env*`, `e2e/.auth/`, `test-results/`,
    `playwright-report/` and `data/digest-preview/`.
  - Playwright traces and videos are off.
  - `NEXT_PUBLIC_` is only the Supabase URL and publishable key. The one
    client file that imports from a server module imports a type only.
  - `lib/auth.ts` and `lib/supabase/server.ts` import `server-only`.
- **Private demo text in the repo.** The private EmbeddedArt claim's wording
  appears only in `data/fixtures/companies.json` (where it is the fixture)
  and in unit-test fixtures. The cleaned `data/scout-briefs/embeddedart.json`
  holds only the member's own question and public facts. The staff-session
  sheets print public claims and the public ranking only. The personal-match
  answers in `eval/redteam-last-run.json` are F2.
- **Prompt injection.**
  - The profiler, judge, tagger, trends, connections, Scout and Copilot all
    wrap outside text in data blocks and make the closing tag harmless.
  - The checks in code come afterwards: the profiler's quote check with the
    injection detector; the judge's eligibility words, apply-steps and
    lengths; Scout's per-option source, date, amount, link and email checks;
    and the Copilot's removal of uncited facts and unknown links.
  - Scout's `read_page` takes a result id, so it reads only URLs a search
    returned. Web results are limited to `ALLOWED_WEB_DOMAINS` by host-suffix
    match.
  - At worst, a hostile opportunity text can put its own wording, link or
    email in front of members, because it is in the cited source. It can also
    trigger the Copilot's save or `contactStaff` (F10).
- **CSRF.** Server actions check the Origin. The auth cookies are
  `SameSite=Lax`, so cross-site POSTs to the route handlers carry no session.

## Could not check

- **Hosted Supabase settings:** whether sign-ups are open (F6), whether the
  Data API exposes `public` (the local config does, and it is the default),
  the JWT lifetime and the leaked-password setting.
- **Netlify environment:** that `INNGEST_DEV` is absent and the signing key
  is set. Whether deploy URLs can re-sync Inngest (F11). Response headers that
  Netlify adds.
- **Inngest Cloud:** who has dashboard access (it shows every run's data).
- **Whether the GitHub repository is public** (it matters for F2's committed
  file).
- **F3 in production:** what a Netlify function can reach on its loopback.
  DNS-name and rebinding bypasses were reasoned, not run, to avoid outside DNS
  tricks.
- **The live chain under load (F7):** reasoned from the code and the README's
  measured rate limits, not run.
- **The newest commits:** the live-source search and Tavily/Brave code
  (`8a99f22`) was read only for F8 and the allow-list. Its keys stay
  server-side (`process.env` in `lib/scout/web-search.ts`).

## How to run the evidence

```bash
npx vitest run tests/security-fetcher.test.ts tests/security-sign-in.test.ts   # pure, always run
npx vitest run tests/security-rls.integration.test.ts                          # needs DATABASE_URL; rolls back
```

The scripts used for the local-only runs (SSRF fetch, sign-in redirect, role
checks, read-only counts) were kept outside the repo. The sign-in runs signed
the demo sessions out again.

## Status after fixes (14 Nov 2026, late evening)

- **F3 (fetcher private-address check): fixed.** `lib/fetcher/fetch-page.ts` blocks private, mapped and reserved addresses, resolves the host name and checks every redirect hop. The five tests in `tests/security-fetcher.test.ts` now pass as plain tests. `lib/scout/fetch-json.ts` gets the address checks but no DNS check.
- **F1, F2, F6 (database rules): not applied.** The SQL below is ready. Applying it is the owner's decision. To make the migration: `npx drizzle-kit generate --custom --name=security_rls`, paste the SQL, then `npm run db:migrate`, then re-run `tests/security-rls.integration.test.ts`. After it, the anon read of `eval_runs` answers "permission denied" instead of 0 rows; count that as 0 in the test. Apply at a quiet moment (short table locks). Also turn off sign-ups in the hosted project.
- **F5 (open redirect), F4 (dev mode in production), security headers, the red-team answers in `eval/redteam-last-run.json`: not done.**
- **Still open:** F7 to F12, F14, F15.

```sql
-- F6: a role is needed to read "signed-in only" data
create or replace function app.has_role() returns boolean language sql stable as $$
  select coalesce(app.role() in ('member', 'staff'), false)
$$;--> statement-breakpoint
grant execute on function app.has_role() to anon, authenticated, service_role;--> statement-breakpoint
drop policy companies_read on companies;--> statement-breakpoint
create policy companies_read on companies for select to authenticated using ((select app.has_role()));--> statement-breakpoint
drop policy snapshots_read on snapshots;--> statement-breakpoint
create policy snapshots_read on snapshots for select to authenticated using ((select app.has_role()));--> statement-breakpoint
drop policy opportunities_read on opportunities;--> statement-breakpoint
create policy opportunities_read on opportunities for select to authenticated using ((select app.has_role()));--> statement-breakpoint
drop policy trend_notes_read on trend_notes;--> statement-breakpoint
create policy trend_notes_read on trend_notes for select to authenticated using ((select app.has_role()));--> statement-breakpoint
drop policy claims_read on claims;--> statement-breakpoint
create policy claims_read on claims for select to authenticated
  using ((visibility = 'public' and (select app.has_role())) or company_id = (select app.company_id()));--> statement-breakpoint
drop policy evidence_read on evidence;--> statement-breakpoint
create policy evidence_read on evidence for select to authenticated
  using ((select app.has_role()) and exists (select 1 from claims c where c.id = evidence.claim_id));--> statement-breakpoint
-- F1: members write only their own corrections, and only move claims between review states
drop policy claims_member_insert on claims;--> statement-breakpoint
create policy claims_member_insert on claims for insert to authenticated
  with check (company_id = (select app.company_id()) and updated_by = 'user'
              and status in ('user_corrected', 'user_confirmed') and confidence = 1);--> statement-breakpoint
revoke update on claims from anon, authenticated;--> statement-breakpoint
grant update (review_state, updated_at) on claims to authenticated;--> statement-breakpoint
-- F2: no anon; members and staff read the summaries, never details
drop policy eval_runs_read on eval_runs;--> statement-breakpoint
create policy eval_runs_read on eval_runs for select to authenticated using ((select app.role()) in ('member', 'staff'));--> statement-breakpoint
revoke select on eval_runs from anon, authenticated;--> statement-breakpoint
grant select (id, kind, git_sha, summary, ran_at) on eval_runs to authenticated;
```

A second, separate rule is needed before members can delete their own Copilot turns (not written as a migration either):

```sql
create policy chats_own_delete on chats
  for delete to authenticated
  using (company_id = (select app.company_id()) and user_id = (select app.user_id()));
```
