# Pitch deck

The pitch, slide by slide. Each slide has a title, 3 to 5 lines for the
screen, speaker notes, and what is on screen. The live demo itself is in
`docs/demo-script.md`; the numbers and their sources are in
`docs/quality-and-boundaries.md`.

The real time limit is not known yet: `[TEAM: pitch time limit]`. This deck
is the 5-minute version. Slides marked **CUT FOR 3 MIN** are dropped in the
3-minute version, and the times in brackets are the 3-minute times.

## Timing

| Block | Share | 5 min | 3 min | Slides |
| --- | --- | --- | --- | --- |
| Problem | 20 % | 60 s | 36 s | 1, 2, 3 |
| Demo | 40 % | 120 s | 72 s | 4, 5 |
| Proof | 20 % | 60 s | 36 s | 6, 7, 8 |
| Next | 15 % | 45 s | 27 s | 9, 10 |
| Built versus reused | 5 % | 15 s | 9 s | 11 |

Rules for every slide:

- One number per claim, and every number comes from the Trust report or the
  test notes, with its date. Say "potential match", never "eligible".
- The app runs on NVIDIA's free models (`nvidia/nemotron-3.5-super-vl-120b-a12b`
  since the evening of 14 Nov 2026), not on Claude.
- Do not read the bullets aloud. The notes are what you say.
- Before the pitch, read every number again from the Trust report (`/trust`)
  and change it here if it moved.

---

## Problem (20 %)

### Slide 1. Virtual Science Park

Time: 10 s (3 min: 6 s)

On screen:

- Virtual Science Park
- Each week, the opportunities that may fit your company, with the source of
  every line.
- `[TEAM: team names]`

Speaker notes: We built a weekly assistant for Blue Science Park's member
companies. It reads the members' own websites and the funding, testbed and
event sources, and tells each member what may fit them this week. Every line
shows where it came from.

### Slide 2. The problem, in BSP's words

Time: 30 s (3 min: 30 s)

On screen:

- "`[TEAM: quote from the BSP interview]`" (BSP staff member, with permission)
- 56 member companies (BSP member list, 14 Nov 2026)
- 188 funding calls, testbeds, events and news items, spread over 8 sources
  (our store, 14 Nov 2026)
- How long matching this by hand takes today: `[TEAM: estimate from the BSP
  interview, for example minutes per member per week]`

Speaker notes: `[TEAM: one sentence that introduces the quote and who said
it]`. BSP has 56 members, and the calls, testbeds and events that could help
them are spread over many sites. Matching them by hand takes `[TEAM: the
estimate from the interview]` today. So we asked: can every member get a
short list each week, with the source of every line?

What is on screen: the quote large, the three numbers small underneath.

### Slide 3. What a member needs. CUT FOR 3 MIN

Time: 20 s (3 min: cut; the last sentence of slide 2 covers it)

On screen:

- A short list for this week, not a search engine
- Why it fits, and a next step for this week
- What is still uncertain
- The source of every line
- Never a decision: a "potential match"

Speaker notes: A member does not want another search box. They want a short
list with a reason and one next step. And they need to be able to check it,
so every line has its source. We never say a company is eligible: that stays
a decision for people.

What is on screen: one "Your week" card as a screenshot, with the five parts
labelled (potential match badge, why it fits, next step, what is uncertain,
source).

---

## Demo (40 %)

### Slide 4. Live demo: a member's week

Time: 80 s (3 min: 60 s)

On screen (only if the live demo fails; otherwise the browser):

- Your week: why, next step, what is uncertain, potential match
- Profile: every fact with its quote, in Swedish, on the page
- Priorities: switch on "Testing and testbeds"
- Scout: a cited brief
- Copilot: a question, "are we eligible?", an override attempt

Speaker notes: Follow `docs/demo-script.md`, steps 1 to 8, signed in as
EmbeddedArt, a BSP member that makes sensor systems for maritime
surveillance. Say what the audience should notice at each step, not what the
button is called. In the 3-minute version skip steps 4, 5 and 6
(priorities, Scout, the first Copilot question) and go straight to "Are we
eligible?".

What is on screen: the browser, full screen. This slide stays behind it as
the backup.

### Slide 5. Live demo: what BSP staff see

Time: 40 s (3 min: 12 s, Trust report only)

On screen (only if the live demo fails):

- Compare two members, from public data only
- Ecosystem map: two members with a stated reason to talk
- A page with hidden instructions, and what the system did with them
- Trust report: every number with its date

Speaker notes: Follow `docs/demo-script.md`, steps 9 to 12, signed in as BSP
staff. Staff see the public ranking only, never what a member entered
privately. In the 3-minute version show only the Trust report (step 12) and
use it as the bridge to the proof slides.

What is on screen: the browser, full screen.

---

## Proof (20 %)

### Slide 6. Every line has a source

Time: 20 s (3 min: 12 s)

On screen:

- 314 of 419 profile quotes found word for word on the company's page
- 85 of 448 profile fields left "missing" rather than guessed
- 181 of 181 source links working
- 22 of 188 opportunities typed in by the team, and labelled so

Speaker notes: Every profile fact carries a quote, and code checks that the
quote is on the stored page. When it is not, the field stays empty rather
than guessed. Every opportunity links to its source, and the last link check
found all of them working. What we typed in by hand says so on the screen.

Numbers on this slide: quote check eval, 14 Nov 2026, 19:11 CET; link check,
14 Nov 2026, 18:27 CET; opportunities in the store, read 14 Nov 2026, 22:02
CET.

### Slide 7. The boundaries hold

Time: 20 s (3 min: 12 s)

On screen:

- Privacy: 17 of 17 tests pass: a member gets no rows of another company's
  private data
- Hidden instructions in a web page: 4 of 4 model steps kept them out of
  their answer
- Checks in code (eligibility words, citations, quotes): 305 of 305 tests
  pass
- Red-team: `[TEAM: red-team pass rate from the Trust report]` of 51 prompts

Speaker notes: Who sees what is decided by the database, not by a prompt.
We planted instructions to an AI in four hidden places on a test page, and
the detector flagged all four. Any text that says "eligible" or "qualifies"
is refused by code after the model answers: in that test, the judge's first
answer used "qualifies", the check refused it, and the retry passed.

Numbers on this slide: privacy run, 14 Nov 2026, 20:36 CET; injection demo,
14 Nov 2026, 20:49 CET (recorded with the earlier model `[CHECK: re-record
with nvidia/nemotron-3.5-super-vl-120b-a12b before the pitch, or say "earlier
model"]`); unit tests, 14 Nov 2026, 22:03 CET; red-team prompts in
`eval/redteam-prompts.json`.

### Slide 8. Does it help?

Time: 20 s (3 min: 12 s)

On screen:

- Timed test: `[TEAM: median time by hand]` by hand against
  `[TEAM: median time with the tool]` with the tool, same task
- Staff session: `[TEAM: relevant top-five items]` of `[TEAM: items rated]`
  top-five items rated relevant by BSP staff
- Profile hand-check: `[TEAM: right]` of `[TEAM: checked]` gold claims right
- Model chosen by test: 15 of 15 keep or reject verdicts right

Speaker notes: `[TEAM: one sentence on the timed test result]`.
`[TEAM: one sentence on what staff said, with permission to quote]`. We
picked the model by testing it on our own prompts, not by its name.

If a result is still missing on the day, say so: "not measured yet", and
name the session that will measure it. Do not estimate.

Numbers on this slide: `data/timed-test/results.json` and
`data/staff-session/results.json` (both on the Trust report);
`profile_accuracy` eval; `docs/model-choice.md`, 14 Nov 2026 (15 items, a
small sample).

---

## Next (15 %)

### Slide 9. Next

Time: 30 s (3 min: 27 s)

On screen:

- Measure with BSP: hand-check, staff session, timed test
- Start the judge after the nightly ranking, so new matches are explained at
  once
- Run the 51 red-team prompts on every change
- Bring in BSP's own testbed list and event dates

Speaker notes: First we measure with BSP, because the numbers that matter
most are not in yet. Then we close the gap in the pipeline: today a match
that enters a top 20 overnight waits for the next judge run. Every change to
the Copilot should pass the same red-team prompts. And BSP knows testbeds and
events that are not on any public page.

### Slide 10. What we need from BSP. CUT FOR 3 MIN

Time: 15 s (3 min: cut)

On screen:

- Who at BSP takes the questions members send
- Which funding sources matter most
- BSP's internal testbed list and event dates
- Permission to run it with real members for a month

Speaker notes: These four answers from BSP decide what we build next. The
address for members' questions is a placeholder today. `[TEAM: adjust to what BSP said
in the interview]`

---

## Built versus reused (5 %)

### Slide 11. What we built, what we reused

Time: 15 s (3 min: 9 s)

On screen:

- Built: collectors, profiler with quote check, matcher, judge, cards, trend
  notes, connection finder, Scout, Copilot, evals, Trust report, privacy
  rules, screens
- Reused: Next.js, Supabase (Postgres, sign-in, row-level security),
  pgvector, Inngest, NVIDIA's free model API, Voyage AI embeddings
- Public data: Vinnova, Energimyndigheten, EU Funding & Tenders, BSP and Tech
  Concept Lab websites

Speaker notes: Everything that decides what a member sees, we built during
the hackathon. The building blocks are standard and replaceable, including the
model. `[TEAM: how the team built it, for example AI coding tools, if the
jury rules ask for it]`. Thank you.

What is on screen: two columns, built and reused, and the site address
`[TEAM: site address to show]`.

---

## Markers in this file

| Marker | Slide |
| --- | --- |
| `[TEAM: pitch time limit]` | top |
| `[TEAM: team names]` | 1 |
| `[TEAM: quote from the BSP interview]`, introduction and estimate | 2 |
| `[TEAM: red-team pass rate from the Trust report]` | 7 |
| `[CHECK: re-record the injection demo with the new model]` | 7 |
| `[TEAM: ...]` timed test, staff ratings, hand-check results | 8 |
| `[TEAM: adjust to what BSP said in the interview]` | 10 |
| `[TEAM: how the team built it]`, `[TEAM: site address to show]` | 11 |
