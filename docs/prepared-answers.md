# Prepared answers for the jury

Short answers to the questions a jury is likely to ask. Every number comes
from the repo or the database and has its date; "not measured yet" names
what will measure it. Say "potential match", never "eligible".

## How do you know a profile is right?

Every stated or inferred claim carries a quote, and code checks that the quote
is on the stored page, word for word. In the latest profiling run per member,
314 of 419 quotes were found and 85 of 448 fields fell back to "missing"
(quote-check eval, 14 Nov 2026). The check proves a quote is on the page, not
that it supports the value: EmbeddedArt's "UV-sensors" passes, although "UV"
on that page probably means underwater. Accuracy is not measured yet (0 of 23
gold claims checked on 14 Nov 2026): the team's hand-check of the three gold
profiles plus `npm run eval`, and the staff ratings from the session, will
measure it.

## What stops made-up facts?

A profile quote that is not on the page is thrown away, and a field with no
surviving quote is stored as "missing", never as an unproven claim. Trend
notes are checked in code: every date, amount and funder must appear in a
cited source, and a note that fails twice is not stored. The judge cannot add
opportunities, only explain or reject the ones it was given, and the
connection finder must cite a real public claim from each company. None of
these checks can catch a wrong reading of a correct source; that is what the
hand-check and the staff session are for.

## What about prompt injection?

The checks above run in code, after the model, so an injected instruction
cannot switch them off. A hidden instruction on a company's page can at
most get a real quote from that page stored next to a wrong value, which the
hand-check would catch. The Copilot (in progress) labels override attempts
before answering, and its tools run with the member's own database rights and
never take a company id from the model, so even a fooled model only reaches
that member's rows. How well this holds is not measured yet: a red-team run,
stored for the Trust report, will measure it.

## Who can see private data?

The database decides, through row-level security, not the prompts. A
member's private claims, priorities, personal matches, feedback, saved items,
chats and Scout briefs are readable only by that member's company; BSP staff
see public data, public matches and questions sent to them, and never chats.
The role and company come from the sign-in token, which users cannot change.
The privacy tests are in `tests/`; a stored pass count for the Trust report is
not measured yet (a privacy test run against the hosted database will give it).

## What does it cost to run?

The models run on NVIDIA's free API, so the model cost today is $0; the limit
is about 30 to 45 requests a minute. One full run of everything took 3,391,022
tokens and 1,353 model calls, about 46 minutes of model calls at 30 a minute
(`npm run cost`, 14 Nov 2026). With everything redone every week, that is at
most 262,401 tokens and 105 calls per member per month; embeddings are free up
to 200 million tokens. The cost on a paid model, hosting, Scout and Copilot
are not measured yet.

## What happens when a source is down?

Every live collector keeps a recorded copy of its source and uses it when the
source fails; the source's status then says "cached", with the date of the
copy, for the Data status page. Hand-entered sources are labelled as such. The link checker
found 181 of 181 opportunity links working (14 Nov 2026), but the EU portal
and Energimyndigheten answer "ok" even for a missing page. When a member's own
website cannot be read, the profile is built from BSP's member page and says
so: 49 of 56 members' websites could be read.

## Why not just use ChatGPT?

A general chatbot does not have BSP's 56 members, a stored copy of their pages
to check quotes against, or a ranked list per member built from nine named
sources and refreshed by scheduled jobs. It also has no rules that keep one
member's private data away from another; here the database enforces them. The
model is one
replaceable part of the system, and the checks around it are what make the
output safe to show.

## What is real and what is simulated?

Real: the 56 members from BSP's site, their profiles built from 56 BSP member
pages and 49 company websites, and 161 opportunities from live sources (EU
130, Vinnova 15, Energimyndigheten 11, BSP news 4, Tech Concept Lab 1). Typed
in by the team and labelled "simulated" in the app: 9 testbeds, 8 regional
funding entries and 5 event series; they describe real offers, with links
checked on 14 Nov 2026. The private data of the three demo members was set by
the team, and 15 old test opportunities are kept out of every ranking. The
staff session and the timed test have not been run yet: no results.

## What did you reuse and what did you build?

Reused: Next.js, Supabase (Postgres, sign-in, row-level security), pgvector,
Drizzle, Inngest for scheduled jobs, NVIDIA's model API, Voyage AI
embeddings, Mozilla Readability, cheerio and linkedom for page text,
shadcn/ui, Zod and Vitest. Data comes from public sources: Vinnova's open
data, the EU Funding & Tenders search, Energimyndigheten's call list, and BSP's
and Tech Concept Lab's websites. Built in the hackathon: the collectors, page
fetcher, quote check, profiler, tagger, matching SQL with its two modes, judge,
cards, trend analyst, connection finder, evals, link checker, cached mode, the
privacy rules and the screens.

## What would you do next?

First, measure: the hand-check of the gold profiles, the staff session and the
timed test, and a look with staff at the judge's rejections. Then try a larger
model, since most quality problems trace back to the small free one. Then
finish Scout and the Copilot and red-team them, start the judge automatically
after the nightly ranking, and check the left-out testbed pages by hand.

## What are the known limits?

The quote check proves a quote is on the page, not that it supports the
value. The small model is noisy: 75 of 183 opportunities and 23 of 56 members
have no tag, the retry saved 2 of 87 failed fields, and about one area in six
fails the trend-note checks. The judge rejected 1,209 of the 2,035 public
match rows it judged (14 Nov 2026), and whether it is too strict is not
measured yet. Only 9 of 27 curated testbeds are stored (the rest had dead or
unchecked links), pages drawn by JavaScript cannot be read, nothing starts
the judge after the nightly ranking yet, and no scheduled run has been seen in
the run history yet.

---

## Where the numbers come from

| Number | Source | Date |
| --- | --- | --- |
| 314 of 419 quotes found; 85 of 448 fields missing; retry saved 2 of 87 | `eval_runs`, kind `quote_check` | 14 Nov 2026 |
| 0 of 23 gold claims checked | `eval_runs`, kind `profile_accuracy` | 14 Nov 2026 |
| 181 of 181 links ok | `eval_runs`, kind `link_check` (latest) | 14 Nov 2026 |
| 3,391,022 tokens, 1,353 calls; 262,401 tokens and 105 calls per member per month | `npm run cost` | 14 Nov 2026 |
| 56 members; 49 company websites read | `companies`, `snapshots` | 14 Nov 2026 |
| 161 live and 22 hand-entered opportunities; 15 test rows | `opportunities` | 14 Nov 2026 |
| 75 of 183 opportunities and 23 of 56 members untagged | `opportunities.tags`, `companies.tags` | 14 Nov 2026 |
| 1,209 of 2,035 judged public rows rejected | `matches` | 14 Nov 2026, evening |
| 9 of 27 testbeds stored | `data/testbeds.seed.json`, `source_status` | 14 Nov 2026 |
| One area in six fails the trend checks | README, "Trend analyst" | 14 Nov 2026 |
