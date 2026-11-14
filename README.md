# Virtual Science Park

Every Blue Science Park member gets a short, ranked list of funding calls,
testbeds, events and partners that fit them this week, with the source of every
line. Nothing is ever called "eligible": that stays a decision for people.

One Next.js app (TypeScript) on Vercel, one Supabase Postgres database with
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
| Models | `nvidia/nemotron-3.5-lightning-30b-a3b` (classifier, tagging), `nvidia/nemotron-3-super-120b-a12b` (everything else) | Both served by the live model list. Model cards list tool calling and structured output as supported |
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
the server). `NVIDIA_MODEL_FAST` / `NVIDIA_MODEL_MAIN` in `.env.local` override the
models without a code change. Last run, 14 Nov 2026: the model IDs passed, but
every chat call returned `403 Authorization failed`, for these models and for
`openai/gpt-oss-20b` too, so NVIDIA refused the key in `.env.local` itself.

## Hosted setup (S2, S4)

1. **Supabase**: create a project, copy the URL, publishable key and secret
   key, and the session-pooler connection string as `DATABASE_URL`. Run
   `npm run db:setup` with those values to migrate, seed and create the demo
   accounts there.
2. **Vercel**: import the GitHub repo, add every variable from `.env.example`
   (without `INNGEST_DEV`), deploy. Put the production URL in `APP_URL`.
3. **Inngest**: install the Vercel integration, or add `INNGEST_EVENT_KEY` and
   `INNGEST_SIGNING_KEY` to Vercel. It finds the functions at `/api/inngest`.
4. **Anthropic** (set a spend limit), **Voyage AI** and **Resend**: add the keys.
5. Run `npm run check:services` until every row says PASS.

## Data status

Everything in the database today comes from `data/fixtures/` and is marked
`simulated`. The snapshot texts there are written by the team, not fetched, so
their quotes are not real quotes from the company sites. Real data replaces
them as the collectors (A9 onward) and the profiler (A6) land.
