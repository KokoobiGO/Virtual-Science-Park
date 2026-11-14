# Tasks that need people

Backlog rows D1–D4, D6, D8–D12 and D21. Nobody can do these from a keyboard: they need BSP staff, testers and the team. Everything to print or paste is on this page or linked from it.

Do them in this order.

| When | Row | What | Time |
|---|---|---|---|
| As early as possible | D3 | Ask the organisers about 12:00 and the pitch | 5 min |
| As early as possible | D1 | Ask BSP the open questions | 10 min |
| As early as possible | D4 | Recruit two testers | 10 min |
| Before the staff session | D2 | BSP interview | 10 min |
| Before testers see the tool | D6 | Timed test by hand | 2 × 15 min |
| Saturday 12:00 | D8 | BSP staff session | 20 min |
| After D6 | D9 | Timed test with the tool | 2 × 15 min |
| Saturday afternoon | D10 | Member check | 10 min |
| Same evening | D11 | Results into the Trust report | 15 min |
| Same evening | D12 | Fix what the session found | — |
| Before the pitch | D21 | Rehearse three times | 3 × pitch length |

---

## D3 — Message to the organisers

Paste and send:

> Hi! Three quick questions from team Virtual Science Park:
> 1. Is Saturday 12:00–13:00 free time, or is it the first judging round?
> 2. May the BSP contacts who sit on the jury give us feedback on our prototype before judging?
> 3. How long is the pitch, and is the demo inside that time?
>
> Thank you!

Write the answers here:

- 12:00–13:00 is: ……………………
- BSP jury members may give feedback: yes / no
- Pitch length: …… minutes, demo included: yes / no

The pitch length decides how `docs/pitch-deck.md` is cut.

## D1 — Questions to BSP

Paste and send, or ask in person:

> Hi! We are building a tool that matches BSP members with funding calls, test facilities and events. Seven short questions so we build the right thing:
> 1. We use Techinova, EmbeddedArt and Malvacom as our three example members. Is that OK?
> 2. We read about 55 members from the BSP website. Is that list complete?
> 3. Which funding sources matter most to your members?
> 4. Does BSP have its own list of test facilities?
> 5. Do the recurring BSP events have fixed dates we can use?
> 6. When a member asks the tool something only staff can answer, which role or address should the question go to?
> 7. Should the interface be in Swedish, English or both?

Write the answers here:

1. ……
2. ……
3. ……
4. ……
5. ……
6. …… (this fills the staff contact in the Copilot: set `BSP_CONTACT_EMAIL`)
7. ……

## D4 — Two testers

Two people from other teams, or BSP staff, who have **not** seen our research or the tool. Each needs about 40 minutes over two sessions (D6 and D9).

- Tester 1: ……………………
- Tester 2: ……………………

## D2 — BSP interview sheet (10 minutes)

Ask first: "May we quote you in our pitch, by name or as 'BSP staff'?"   yes, by name / yes, as BSP staff / no

1. When a member asks "is there funding or a test facility for us?", what do you do today?
2. How long does one such search take you?  …… minutes / hours
3. How often does it happen?  …… times a week / month
4. Where do you look?
5. What do you miss or find too late?
6. How do members hear about new calls today?
7. What would make you trust a suggestion from a tool? What would make you not trust it?

Write down **exact words**, not a summary. The pitch needs one quote and one "today it takes X" number.

Quote: "……………………………………"
Time today: ……

---

## D6 and D9 — The timed test

The answer key, record sheet and result format are in `data/timed-test/` (`answer-key.md`, `record-sheet.md`, `results.example.json`). Testers must not see the answer key.

| | Tester 1 | Tester 2 |
|---|---|---|
| **D6, by hand** | Task A | Task B |
| **D9, with the tool** | Task B | Task A |

The tasks are swapped so nobody repeats a task they have already solved.

- **Task A:** find test facilities where a company could test an underwater sensor.
- **Task B:** find open funding calls that could suit Techinova.

### Instructions to read to the tester, by hand (D6)

> You have 15 minutes. Use any website and any search engine, but no AI assistant. Write down every result you would pass on to the company, with its link. Say "done" when you think you have enough. Please think aloud.

### Instructions to read to the tester, with the tool (D9)

> You have 15 minutes. Use only this tool. You are signed in as the company. Write down every result you would pass on to the company. Say "done" when you think you have enough. Please think aloud.

### What the observer records, per run

- Start time and stop time (stopwatch; stop at 15:00 if not done)
- The results the tester wrote down
- How many match the answer key
- The pages they visited (by hand) or the screens they used (with the tool)
- Where they got stuck, in their own words

Fill one `record-sheet.md` per run. Four runs in total.

---

## D8 — BSP staff session (Saturday 12:00, 20 minutes)

Print the rating sheets first:

```bash
npm run session:sheets
```

| Minutes | What staff do | What we do |
|---|---|---|
| 0–2 | Listen | Say what the tool is and that we want faults, not praise |
| 2–9 | Mark each claim in the three gold profiles right / wrong / unsure | Stay quiet |
| 9–14 | Mark each of the top five recommendations per member relevant / not relevant | Stay quiet |
| 14–20 | Use Your week and think aloud | Write down exact quotes |

Before the session: sign in as a staff account and as one gold member in two browser tabs. Switch EmbeddedArt's "Testing and testbeds" priority off if you plan to show the re-rank.

Do not explain or defend the tool during the session. Every "why does it say that?" is a finding.

## D10 — Member check (10 minutes)

One person from Techinova, EmbeddedArt or Malvacom looks at their own profile and their own week.

1. "Is anything on this profile wrong?"
2. "Is anything important missing?"
3. "Which of these cards would you open? Which would you ignore?"
4. "Would you correct the profile yourself if you could?"

Who did it: …………………… (company, role)

If nobody from a gold member can be reached, use a stand-in and write that here. Say so in the pitch.

---

## D11 — Results into the Trust report

Give the orchestrator (Claude) the following; photos of the sheets are fine:

- the four timed-test record sheets
- the filled staff rating sheets
- the quotes from D2, D8 and D10, with permission noted

They are entered so the Trust report and the pitch show measured numbers where they now say "not measured yet".

## D12 — Fix what the session found

The same evening, agree the three to five most important complaints and hand them over. Keep the list of what changed because of the session: the pitch uses it.

| Complaint, in their words | Fixed? | What changed |
|---|---|---|
| | | |
| | | |
| | | |

## D21 — Rehearse three times

Follow `docs/demo-script.md`.

| Run | Mode | Time | What went wrong |
|---|---|---|---|
| 1 | Live | | |
| 2 | Live | | |
| 3 | Cached (`DEMO_MODE=cached`) | | |

Before each run:

- Switch EmbeddedArt's "Testing and testbeds" priority **off**. The re-rank step needs it to start off.
- Run the automated demo path once (`npm run e2e`).
- Have the backup video ready to play offline.
