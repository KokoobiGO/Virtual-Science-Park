# Virtual Science Park

Every Blue Science Park member gets a short, ranked list of funding calls,
testbeds, events and partners that fit them this week, with the source of every
line. Nothing is ever called "eligible": that stays a decision for people.

One Next.js app (TypeScript) on Netlify, one Supabase Postgres database with
pgvector, and Inngest for scheduled jobs. See the Solution Plan v2 for the why.

## Run it locally

You need Node.js 22.12 or newer and Docker Desktop (for the local Supabase).

```bash
git clone https://github.com/KokoobiGO/Virtual-Science-Park.git
cd Virtual-Science-Park
npm ci
cp .env.example .env.local
npm run supabase:start
```

`supabase:start` prints the local URL, publishable key and secret key (run
`npx supabase status` to see them again). Put them in `.env.local`, set a
`DEMO_USER_PASSWORD` of 12+ characters, then:

```bash
npm run db:setup      # migrations + fixtures + demo accounts
npm run dev           # http://localhost:3000
npm run inngest:dev   # second terminal: http://localhost:8288
```

Sign in with one of the demo accounts below to see the member or staff menu.

| Account | Role |
|---|---|
| `techinova@demo.vsp.test` | Member, Techinova |
| `embeddedart@demo.vsp.test` | Member, EmbeddedArt |
| `malvacom@demo.vsp.test` | Member, Malvacom |
| `staff@demo.vsp.test` | BSP staff |

All four share `DEMO_USER_PASSWORD`. Share it with the team out of band.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` / `test` | What CI runs on every push |
| `npm run db:generate` | New migration from a change to `lib/db/schema.ts` |
| `npm run db:migrate` | Apply `drizzle/` to `DATABASE_URL` |
| `npm run db:seed` | Load the fixtures (safe to re-run) |
| `npm run db:demo-users` | Create or refresh the four demo accounts |
| `npm run db:setup` | All three above, in order |
| `npm run supabase:start` / `supabase:stop` | Local Supabase in Docker |
| `npm run inngest:dev` | Local Inngest dev server and run history |
| `npm run check:services` | One test call per hosted service (S2) |
| `npm run check:claude` | One test call per Claude feature (S3); costs a few cents |
| `npm run check:nvidia` | One test call per NVIDIA API feature (S3); free developer key |
| `npm run fetch:page -- <url>` | Print the clean text of one web page (A1); add `--save` to store it as a snapshot |
| `npm run profile:status` | Count of profiled, thin, failed and not yet profiled members, with the reason for each thin or failed one (A8) |

`npm test` runs unit tests always. The privacy tests in `tests/` also run when
`.env.local` points at a database with `db:setup` done, and skip otherwise.

## Where things are

```
app/                 pages, server actions, /api/inngest
components/          header, placeholders, shadcn/ui in components/ui
lib/schemas.ts       the shared contract (S5): Claim, Evidence, CompanyProfile, Opportunity, Match
lib/db/schema.ts     Drizzle tables (S6); drizzle/ holds the migrations
drizzle/0002_rls.sql row-level security policies (S8)
lib/auth.ts          signed-in user, role and company (S7)
lib/db/user.ts       Drizzle as the signed-in user, so RLS applies
lib/llm.ts           Claude model IDs and tool versions (S3)
lib/nvidia.ts        NVIDIA API model IDs and a fetch client (S3), for testing
lib/voyage.ts        Voyage AI embeddings client (voyage-4, 1024 dimensions)
lib/resend.ts        Resend email client, for the weekly digest (C18)
lib/fetcher/         page fetcher (A1): download a page, turn the HTML into clean text
lib/snapshots.ts     a URL in, a stored snapshot out (A1); jobs and scripts only
lib/members/         member list import (A2): BSP's member list and pages into companies
lib/profiler/        profiler (A5, A6, A8): page text in, claims out; quote check with one retry; thin rule; storage
lib/normalize.ts     text normaliser (A3): spacing, quote marks, dashes, capitals; for comparing only
lib/quote-check.ts   quote verifier (A4): is a claim's quote in the stored page text, word for word?
lib/inngest/         Inngest client and functions (S10)
data/fixtures/       hand-written sample data (S9), all SIMULATED
scripts/             migrate, seed, demo users, service checks
tests/               privacy integration tests
```

## Privacy model

The database decides who sees what, not the prompts. Supabase Auth puts
`app_metadata.role` (`member` or `staff`) and, for members, `company_id` in
every access token; users cannot change it. The policies in
`drizzle/0002_rls.sql` then apply:

- Public BSP data (companies, public claims, snapshots, opportunities) is
  readable by any signed-in user.
- Private claims, priorities, personal matches, feedback, saved items, chats
  and Scout briefs are readable only by their own company.
- Staff read public data and public matches, plus handoffs sent to them. Staff
  never read chats.
- Jobs use `DATABASE_URL` (the table owner) and bypass RLS. Never use
  `getDb()` from a request path: use `withUserDb()` or the Supabase server client.

## Claude API versions (S3)

Checked against the live Claude docs on 13 Nov 2026. `@anthropic-ai/sdk` is
pinned to exactly **1.8.0** because the Tool Runner is beta.

| Feature | What we use | Note |
|---|---|---|
| Models | `claude-haiku-5-5` (classifier, tagging), `claude-sonnet-5-5` (everything else) | Plan IDs confirmed. Retirement not before Oct / Sep 2027 |
| Web search | `web_search_20260318` | **The plan says `web_search_20250305`**, the basic version. 20260209 added dynamic filtering, 20260318 adds `response_inclusion`. $10 per 1,000 searches |
| Structured outputs | `client.messages.parse` with `output_config.format = zodOutputFormat(schema)` | `output_format` is deprecated |
| Tool Runner | `client.beta.messages.toolRunner` with `betaZodTool` | Beta |
| Refusal fallback | beta `server-side-fallback-2026-07-01`, `fallbacks: "default"` | Recommended on Sonnet 5.5 calls |

Things that return a 400 on Sonnet 5.5 and Haiku 5.5: forced `tool_choice`
(`any` / `tool`), `thinking: {type: "disabled"}` on Sonnet 5.5 (use
`between_tools` or low effort), and `temperature` / `top_p` / `top_k` on API
version `2026-10-21`.

`npm run check:claude` makes one test call per row. It has not been run yet:
it needs `ANTHROPIC_API_KEY`.

## NVIDIA API (S3)

We test with NVIDIA's free developer key instead of Claude. Model IDs were
checked against the live model list (`GET /v1/models`) on 14 Nov 2026 and live
in `lib/nvidia.ts`. The API is OpenAI-compatible chat completions at
`https://integrate.api.nvidia.com/v1`, called with plain `fetch`, so there is
no SDK version to pin.

| Feature | What we use | Note |
|---|---|---|
| Models | `nvidia/nemotron-3.5-lightning-30b-a3b` for both the fast and the main slot | `nvidia/nemotron-3-super-120b-a12b` is in the live model list but answers 404 "Function not found for account" for our free key, so main uses the fast model until a bigger model is confirmed |
| Structured outputs | `response_format: {type: "json_schema", ...}`, falling back to `nvext.guided_json` | The check reports which of the two the endpoint accepted |
| Tool calling | `tools` + `tool_choice: "auto"`, answer with a `role: "tool"` message | No Tool Runner: the agent loop is ours |
| Web search | None | No server-side search is documented. Scout needs a search API exposed as a tool |

The Nemotron 3 Super model card turns reasoning on or off with
`chat_template_kwargs: {enable_thinking: true | false}` and recommends
`temperature` 1.0 and `top_p` 0.95. The check leaves both at the defaults and
allows 4,096 output tokens, so reasoning cannot crowd out the answer.

`npm run check:nvidia` makes one test call per row with the key in
`.env.local`, and explains a 401 or 403 answer. The same checks run on the
deploy, with Netlify's key, at `/staff/checks` (staff only; the key stays on
the server). `NVIDIA_MODEL_FAST` / `NVIDIA_MODEL_MAIN` override the models
without a code change. The "Model IDs" row only checks that a model is listed,
not that the key may call it.

## Hosted setup (S2, S4)

1. **Supabase**: create a project, copy the URL, publishable key and secret
   key, and the session-pooler connection string as `DATABASE_URL`. Run
   `npm run db:setup` with those values to migrate, seed and create the demo
   accounts there.
2. **Netlify**: the site deploys from `main` on GitHub. Add every variable from
   `.env.example` (without `INNGEST_DEV`) and redeploy after each change. Put
   the production URL in `APP_URL`.
3. **Inngest**: add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to Netlify,
   redeploy, then sync the app so Inngest Cloud knows its functions:

   ```bash
   curl -X PUT https://jade-kashata-27a74f.netlify.app/api/inngest
   ```

   It answers `Successfully registered`. Sync again after a deploy that adds
   or changes a function (or use Resync in the Inngest dashboard). "Run Inngest
   check" at `/staff/checks` sends the heartbeat event and waits for its run.
4. **Anthropic** (set a spend limit), **Voyage AI** and **Resend**: add the keys.
   "Run Voyage check" at `/staff/checks` embeds one text with the deployed key;
   "Run Resend check" sends one email to Resend's test inbox (nobody gets it).
5. Run `npm run check:services` until every row says PASS.

## Page fetcher (A1)

`fetchSnapshot({ url, source, companyId })` in `lib/snapshots.ts` downloads a
page, turns it into clean text and stores it in `snapshots` with its URL, date,
language and a hash of the text. Quotes are checked against that stored text.

- Readability picks the main content of article-like pages. When it keeps less
  than half of the page's text (typical for a company home page), the whole
  body is used instead, without menus, footers and cookie banners.
- A page whose text has not changed gives the existing snapshot back.
- Only public http(s) addresses, 15 s and 5 MB at most. Pages drawn by
  JavaScript come out empty and are refused with a clear message.
- Jobs call `fetchSnapshot()` in a step, or send `app/snapshot.requested`.
  Staff can try a URL under "Page fetcher" at `/staff/checks`.

## Profiler (A5, A6, A8)

The `profile-company` job profiles one member: it stores the company's home
page and its BSP member page as snapshots, asks the model for the eight profile
fields, checks every quote against the stored page text, gives failed fields
one retry, and stores what passed. A field that fails twice is stored as
`missing`, never as an unproven claim.

```
event: app/company.profile.requested   data: { "slug": "techinova" }
```

- Add `"dryRun": true` to get the claims back in the run's output without
  storing them.
- Values are in English; quotes stay in the page's language, three per field at
  most. The quote check only proves a quote is on the page, not that it
  supports the value: that is what the hand-check (A7) is for.
- Nothing is deleted: the profiler's earlier claims become `superseded`. Where
  the member has their own claim for a field, the new one is `suggested`.
- Each run is logged in `job_runs` with its tokens, retried and dropped fields.
- Model: `nvidia/nemotron-3.5-lightning-30b-a3b` with thinking off, about 10 s
  a company. With thinking on it runs past Netlify's 30 s limit for one step.

### Profiling all members

```
event: app/members.profile.requested   data: {}
```

The `profile-all-members` job sends one `app/company.profile.requested` event
per member; `profile-company` runs at most two steps at once (NVIDIA's free
key is rate limited). Each company then gets `profile_status` and `profile_note`:

- `profiled`, or `thin` when fewer than 3 of the 7 factual fields (all but
  `inferredInterests`) could be supported with quotes: "too little public info".
- `failed` when the run gave up after its retry; the note has the error.
- The note also says when the company's own website could not be read, or none is listed, and only
  BSP's member page was used.

Without `force` only members never profiled or `failed` last time are sent, so
running it again picks up the rest. `"force": true` profiles everyone again;
`"limit": 3` sends the first three by slug, for a test. Check progress with
`npm run profile:status`.

## Member import (A2)

The `import-members` job reads BSP's member list from the site's WordPress API
(`/wp-json/wp/v2/medlem`, 56 members on 14 Nov 2026) and each member's page,
and writes name, description, industry, size, founding year, town and website
to `companies`. A member without a website link gets `website_missing = true`.

- Rows are matched on the slug, so running it again updates the same rows, and
  the three gold members keep `is_gold`.
- Start it with "Import members" at `/staff/checks`, or send the event
  `app/members.import.requested`. The run is logged in `job_runs` and in
  `source_status` as `bsp_members`.
- `npm run db:seed` writes the fixture values back over the three gold
  members; run the import again afterwards.

## Data status

The `companies` rows come from the live BSP member pages (A2). Everything else
in the database today comes from `data/fixtures/` and is marked `simulated`. The snapshot texts there are written by the team, not fetched, so
their quotes are not real quotes from the company sites. Real data replaces
them as the collectors (A9 onward) and the profiler (A6) land.
