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
| `npm run collect -- <source\|all>` | Run one collector or all of them and store the opportunities (A9 to A13, A25, A26); add `--dry` to only print |
| `npm run enrich` | Tag and embed opportunities and companies that have no embedding yet (A14); `--force`, `--limit N`, `--dry` |
| `npm run similar -- <slug>` | The nearest opportunities and companies to one member, by embedding (A14) |
| `npm run match -- [slug ...]` | Rank and store the top 20 opportunities per company in both modes (A15); `--dry` prints the ranking with its five parts |
| `npm run connections` | Find pairs of members with a stated reason to talk, for staff (A28); `--dry`, `--limit N` (a stored `--limit` run replaces the whole table) |
| `npm run gold:export` | Write one file per gold member to `data/gold-profiles/` for the team's hand-check (A7); keeps verdicts already filled in |
| `npm run eval` | Profile accuracy from the hand-check files and the quote-check drop rate, stored for the Trust report (A21); `--dry` |
| `npm run trends -- [area ...]` | Write this week's note per technology area from news and new calls (A27); `--dry` |
| `npm run judge -- [slug ...]` | Judge the ranked matches: keep or reject, why, next step, what is unsure (A16); `--dry`, `--limit N`, `--force` |
| `npm run cards -- [slug ...]` | Build this week's "Your week" cards from the judged matches (A17); `--dry` |
| `npm run cost` | Tokens and model calls per full run and per member per month, from the real runs; $0 on NVIDIA's free API (A24) |
| `npm run check:links` | Check every opportunity's source link and store the result for the Trust report (A20); `--dry`, `--limit N` |
| `npm run sources:status` | One line per data source: ok, stale, cached or hand-entered (A19) |

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
lib/collectors/     collectors (A9 to A13, A25, A26): one folder per outside source, one shared store
lib/tagger/         tagger (A14): which of the six tags a text is about
lib/embeddings/     embedding texts and the enrich functions (A14)
lib/matcher/        matcher (A15, A18): the ranking SQL, the score parts, storing the top 20
lib/connections/    connection finder (A28): candidate pairs, the judge, the checks, storing
lib/eval/           evals (A21): profile accuracy, quote-check drop rate; one entry per eval
lib/trends/         trend analyst (A27): inputs per area, the note writer, the fact checks
lib/judge/          judge (A16): the prompt, the checks on the answer, the rounds per company, storing
lib/cards/          "Your week" cards (A17): which judged matches become cards, the week, storing
lib/links/          link checker (A20)
lib/sources/        source health verdicts (A19)
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

## Collectors (A9 to A13, A25, A26)

A collector reads one outside source and returns opportunities; it never
touches the database. `storeCollected()` upserts them on (source, external id)
and updates the source's row in `source_status`.

```
event: app/sources.collect.requested   data: {}   or   { "sources": ["vinnova"] }
```

| Key | Source | How |
| --- | --- | --- |
| `vinnova` | Vinnova's open data API, open public rounds | live, recorded fallback |
| `energimyndigheten` | The calls list behind energimyndigheten.se/utlysningar | live, recorded fallback |
| `eu_funding` | EU Funding & Tenders search API (unofficial), six text searches plus four programmes | live, recorded fallback |
| `regional` | `data/regional-funding.json`: Region Blekinge, Almi, Interreg South Baltic | hand-entered |
| `testbeds` | `data/testbeds.seed.json`: the curated list plus Vinnova's testbed list | hand-entered |
| `tcl_events` | Tech Concept Lab's WordPress API, event date parsed from the text | live, recorded fallback |
| `bsp_events` | `data/series-events.json`: recurring BSP and MTC series | hand-entered |
| `bsp_news` | BSP's WordPress posts, last 45 days | live, recorded fallback |

- Every live collector keeps a real `recorded.json` next to its code. When the
  source fails, or with `DEMO_MODE=cached`, that copy is used and the source's
  state is "cached" with the date of the copy.
- Hand-entered sources are stored with `simulated = true`, the plan's label
  for anything the team wrote by hand. Testbeds whose link is dead or could not
  be checked stay in the JSON with `linkOk: false` and are not stored.
- New collector: a folder in `lib/collectors/` that exports a `Collector`
  (see `types.ts`), added to the list in `lib/collectors/index.ts`.
- Import `cheerio/slim`, never `cheerio`: the main entry loads its own undici,
  which takes over Node's built-in fetch and can crash the process.

## Tags and embeddings (A14)

```
event: app/enrich.requested   data: {}   or   { "force": true }
```

The `enrich` job fills `tags` and `embedding` on opportunities, and `tags`,
`public_embedding` and `company_private.personal_embedding` on companies. It
also runs every night at 03:30, after the collectors.

- A row is picked up when its embedding is empty. Collectors clear an
  opportunity's embedding when its text changes; a new profile clears the
  company's. `force` does everything again.
- Tags: the fast model answers yes or no for each of the six tags, ten texts a
  call. Hand-curated testbeds keep their own tags. Zero tags is a valid answer.
- The public embedding is built from active public claims only. The personal
  one adds the company's private claims and priorities.
- Voyage without billing allows 3 requests and 10,000 tokens a minute, so a
  full run takes about 10 minutes with `npm run enrich` and longer as a job.

## Matcher: retrieval and score (A15, A18, A22)

```
event: app/match.requested            data: {}   or   { "slugs": ["embeddedart"] }
event: app/company.profile.changed    data: { "companyId": "..." }
```

`rankCompany(db, companyId, mode)` in `lib/matcher/rank.ts` is one SQL
statement that ranks the current opportunities for one company. The
`match-companies` job stores the top 20 per company and mode in `matches`; it
also runs at 04:30 every night and after the enrich job found something new.

| Part | Weight | What it is |
| --- | --- | --- |
| similarity | 0.45 | Cosine similarity of the two embeddings, minus the opportunity's average similarity to all companies, rescaled 0 to 1 inside the company's pool |
| tagOverlap | 0.20 | Shared tags over all tags of the two |
| priorityBoost | 0.15 | Personal only: the similarity, when the kind answers a switched-on priority |
| urgency | 0.10 | A deadline or event date within 60 days |
| feedback | 0.10 | Personal only: 1 for saved or useful items, otherwise how much the item's tags look like liked and dismissed ones |

- The pool: opportunities with an embedding, no fixtures, no passed deadlines
  or event dates, no news older than 45 days, no news about the company itself,
  nothing the company marked not relevant, nothing the judge rejected.
- Public mode reads public data only: no `company_private`, no feedback, and
  the company's public embedding.
- The fast path after a profile edit is `rankCompany` on the member's own
  database client: the new order is back in about 0.1 to 0.4 s. The job stores
  it afterwards.
- Storing never deletes: rows that fall out of the top 20 get `rank = null` and
  keep the judge's text. A company without an embedding is skipped, not wiped.
- `tests/ranking.integration.test.ts` holds the A22 tests. Every write in them
  is rolled back.

## Connection finder (A28)

```
event: app/connections.requested   data: {}
```

For BSP staff: pairs of members that may have a reason to talk, with the
reason and the public claims it rests on. Stored in `connections`, which only
staff can read.

- Candidates: each profiled company's 4 nearest companies by public embedding,
  the 60 closest pairs.
- The model sees both companies' public claims only and says whether there is
  a concrete reason (supplier and customer, complementary technology). Two
  companies that do the same thing are not a reason.
- Checks in code: the reason cites at least one real public claim from each
  side, and it never says that a company is interested or looking.
- Show `CONNECTION_DISCLAIMER` from `lib/connections` with every pair:
  neither company has expressed interest.
- The table always holds the latest run. Borderline pairs can come and go
  between runs, because the model is not fully stable on them.

## Hand-check and eval (A7, A21)

1. `npm run gold:export` writes `data/gold-profiles/<slug>.json` for the three
   gold members: every active, public claim the profiler wrote, with its
   quotes and two fields to fill in.
2. The team opens each file and sets `"verdict"` to `"right"` or `"wrong"` on
   every claim (and `"note"` when it helps), checking against the company's
   own pages. For a `missing` claim, "right" means the pages really do not say
   it. Put your names in `checkedBy`. Commit the files.
3. `npm run eval` stores two `eval_runs` rows:
   - `profile_accuracy`: right / checked for stated, inferred and missing
     claims, per company and in total. Unchecked claims are counted as
     unchecked, never as right.
   - `quote_check`: per company's latest profiling run, how many quotes were
     found in the page text and how many fields were dropped because their
     quotes failed.

Do the hand-check after the last time the gold members are profiled: a new
profiling run gives every claim a new id, and the export then starts the
verdicts over (it warns when that happens). `npm run eval -- <name>` runs one
eval; a new eval is one more entry in `lib/eval/index.ts`.

## Judge and "Your week" cards (A16, A17)

```
event: app/judge.requested           data: {}   or   { "slugs": ["embeddedart"] }   or   { "force": true }
event: app/company.judge.requested   data: { "slug": "embeddedart" }
event: app/cards.requested           data: {}   or   { "slugs": ["embeddedart"] }
```

The judge reads a company's profile and its ranked matches, five per model
call, and writes on each match row a why, a next step for this week and one to
three things the text leaves open, or rejects the match with a reason. It can
only answer for the matches it was given, and `eligibility` stays
`potential_match`.

- Checks in code before anything is stored: no eligibility words ("eligible",
  "qualifies", "guarantee" ...), no next step that says "apply", lengths, and a
  reject that names a link to the company is asked again. An entry that fails
  twice stays unjudged and the next run picks it up.
- Public rows are judged from public claims only. Personal rows are a copy of
  the public judgement unless the company has private data.
- A rejected row leaves the company's pool. After the first round the ranking
  is filled up once and the new rows are judged; rows rejected in that second
  round keep their rank, so every reader must filter on `rejected`.
- Many rejections are normal: the matcher always stores 20 rows per company,
  and members such as a public agency or a bank have few real matches among
  the stored opportunities. An event is kept for any member that could attend.
- Cards: no model call. Up to 6 judged personal matches in rank order (at most
  3 of one kind, 2 of one source, no news) plus one trend card when this week
  has a trend note for one of the company's tags. Stored per company and week
  in `week_cards`; building again replaces that week. Also Mondays at 06:00.
- Nothing starts the judge after the nightly re-rank yet: rows that enter a
  top 20 later stay unjudged (and out of the cards) until `npm run judge` or
  `app/judge.requested` runs.

## Trend analyst (A27)

```
event: app/trends.requested   data: {}   or   { "areas": ["marine"] }
```

One note per technology area per week in `trend_notes`, written from that
week's news and new calls; also every Monday at 05:00. A note needs at least
two inputs and cites at most four.

- Checks in code before a note is stored: every date, year, amount and funder
  in it appears in a cited input, a deadline is not written as an opening
  date, and there are no promise words. A note that fails twice is not stored,
  so an area can be without a note in a given week.
- With the small test model the notes read as "what closes when in your area"
  more than as market analysis, and about one area in six fails the checks.

## Source status, cached mode and schedules (A19, A23)

- `DEMO_MODE=cached`: collectors use their recorded copies and `fetchSnapshot()`
  returns the latest stored page instead of fetching. The member list import
  still reads BSP's site live.
- `npm run sources:status` reads `source_status`: `ok` (live, success within
  48 hours), `stale`, `cached` (with the date of the copy) or `hand_entered`.
- Schedules, Swedish time: collectors every night at 03:00, enrich at 03:30,
  profile refresh on Mondays at 04:00 (`app/members.refresh.requested` starts
  it by hand).
- Profile refresh (`"refresh": true` on `app/company.profile.requested`): when
  no page changed, nothing is asked of the model. Otherwise a field counts as
  changed only when its value differs and it brings a quote the old claim did
  not have; the new claim is stored as `suggested` and the old one stays active.
- `isStale()` in `lib/profiler/stale.ts`: a claim older than 90 days.

## Link checker (A20)

`npm run check:links` asks for every opportunity's URL once (and every source
of a week card) and stores one `eval_runs` row of kind `link_check`.

- `ok`: a 2xx answer after redirects. `broken`: 404 or 410, no such host, a
  refused connection, a TLS error, a 5xx twice, or a redirect to the site's own
  `/404` page. `blocked`: 401, 403, 429 or a timeout, so a person must check.
- Limits of the check: the EU portal answers 200 for any topic id, so "ok"
  there only means the portal is up. Energimyndigheten also answers 200 for a
  missing page.

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
