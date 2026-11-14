# Team checklist

The tasks only people can do. In order: the early ones need lead time. Each
item says what to bring and where the result goes in the repo. Tick them off
here.

Rules: use anonymous labels for testers (P1, P2), never names. Quote BSP
staff or members only with their permission. Type in what was said or
measured, never an estimate of it.

---

## Before the sessions

### 1. Confirm the day and the rules

- [ ] Confirm the pitch is on Saturday at 12:00.
- [ ] Get the jury rules and the pitch time limit.
- [ ] Ask whether the jury wants to know how the team built it (for example
      with AI coding tools).

Bring: the organisers' contact.
Result: the time limit replaces `[TEAM: pitch time limit]` at the top of
`docs/pitch-deck.md` (5-minute or 3-minute version). The build answer goes in
slide 11.

### 2. Send BSP the open questions

Send them in one message, today, so the answers come back before the
sessions.

- [ ] **Gold set:** are EmbeddedArt, Malvacom and Techinova the right three
      members to check closely, and may we show them in the pitch?
- [ ] **Member list:** is the list on BSP's site complete? We read 56 members
      on 14 Nov 2026.
- [ ] **Funding sources:** which funding sources matter most to members?
- [ ] **Testbeds:** does BSP have an internal list of test facilities?
- [ ] **Events:** the real dates of BSP's and MTC's recurring events.
- [ ] **Handoffs:** which staff role takes the questions members send from the
      Copilot, and at which address?
- [ ] **Language:** should members see the app in Swedish or English?

Result, per answer:

- Gold set, member list, funding sources, testbeds, event dates and language:
  give them to the orchestrator. Testbeds go into `data/testbeds.seed.json`,
  event dates into `data/series-events.json`.
- Handoff address: replace the placeholder `bsp-staff@PLACEHOLDER.invalid`
  (`BSP_CONTACT` in `lib/copilot/policy.ts`), then run
  `npx tsx lib/copilot/write-policy-doc.ts` so `docs/scope-policy.md`
  matches. Or give the address to the orchestrator.

### 3. Book the people

- [ ] A 10-minute interview with one BSP staff member (item 6).
- [ ] Two testers for the timed test, not from the team (item 7). About 45
      minutes each.
- [ ] BSP staff for the staff session (item 8). About 30 minutes.
- [ ] One member company for the member check (item 9), ideally one of the
      gold members.

Bring: a time slot for each. Result: the names stay with the team; the repo
only gets anonymous labels.

### 4. Confirm the timed-test answer key

`data/timed-test/answer-key.md` is a draft.

- [ ] Tick "counts" or "does not count" for every unsure item (A2 to A4, B4
      to B13) and once for the group B14 to B18.
- [ ] Decide the two open questions: may a find from outside the database
      score, and in which order does each tester do the tasks?
- [ ] On the test day, check the dates in "Check on the day".
- [ ] Remove the "DRAFT" line.

Bring: the answer key and a browser. Result: the edited
`data/timed-test/answer-key.md`, committed before the first tester starts.

### 5. Hand-check the gold profiles

- [ ] Open `data/gold-profiles/embeddedart.json`, `malvacom.json` and
      `techinova.json` (23 claims in all on 14 Nov 2026).
- [ ] For each claim, check it against the company's own pages and set
      `"verdict"` to `"right"` or `"wrong"`. For a `missing` claim, "right"
      means the pages really do not say it. Add a `"note"` when it helps.
- [ ] Put your names in `"checkedBy"`.
- [ ] Run `npm run eval`.

Do this after the last time the gold members are profiled: a new profiling
run gives every claim a new id and starts the verdicts over.

Bring: the three files and the companies' websites. Result: the files,
committed; `npm run eval` stores the accuracy for the Trust report. It
replaces the hand-check markers in `docs/pitch-deck.md` (slide 8) and
`docs/quality-and-boundaries.md`.

---

## The sessions

### 6. The BSP interview (10 minutes)

- [ ] Ask: how do you find funding, testbeds and events for members today?
      How long does it take, per member or per week? What gets missed?
- [ ] Ask for permission to quote, and how to name the speaker (role only, or
      name).
- [ ] Write the answers word for word.

Bring: these questions on paper, a pen, a phone for timing. Result: one
quote and the time estimate go into `docs/pitch-deck.md`, slide 2, replacing
`[TEAM: quote from the BSP interview]` and the estimate marker. Keep the
notes and the permission with the team.

### 7. The timed test

- [ ] Print one record sheet (`data/timed-test/record-sheet.md`) per run. A
      run is one tester doing one task (A or B) by hand or with the tool.
- [ ] Each tester does the tasks by hand (own search, no Virtual Science
      Park) and with the tool, in the order decided in item 4.
- [ ] Stop at 15 minutes or when the tester says "done".
- [ ] Score each result against the confirmed answer key.

Bring: the printed sheets, the answer key, a stopwatch, a laptop signed in as
a member demo account. Result: the runs go into
`data/timed-test/results.json`. Follow `data/timed-test/README.md` for the
format.

### 8. The staff session

- [ ] Run `npm run session:sheets` first, so the sheets show today's data.
- [ ] Print the sheets in `data/staff-session/`: `claims-*.md` (profile
      claims), `top5-*.md` (each member's top five) and `think-aloud.md`.
- [ ] Sign in as a member demo account for the think-aloud part (staff
      accounts have no "Your week").
- [ ] Staff tick a box for every item and say why. Ask for permission before
      you use any quote.

Bring: the printed sheets, a laptop, pens. Result: the ratings go into
`data/staff-session/results.json`. Follow `data/staff-session/README.md` for
the format.

### 9. The member check

- [ ] Show one member company its own profile and "Your week".
- [ ] Ask: which facts are right or wrong, and which cards would you act on?
- [ ] Ask for permission before you use any quote.

Bring: a laptop signed in as that member's demo account (if it is a gold
member), and its printed `claims-*.md` and `top5-*.md` sheets. Result:
follow `data/staff-session/README.md`. If it has no place for a member's
answers, give your notes to the orchestrator.

### 10. Type in the results

- [ ] `data/timed-test/results.json` and `data/staff-session/results.json`,
      in the format their README files give.
- [ ] Open the Trust report (`/trust`) and check that the timed test and the
      staff session show your numbers, with no "cannot be read" message.
- [ ] Commit the results files.

Result: the Trust report shows the numbers. They replace the `[TEAM: ...]`
markers in `docs/pitch-deck.md` (slide 8) and
`docs/quality-and-boundaries.md`.

---

## Before the pitch

### 11. Record the backup video

- [ ] Follow "Backup video" in `docs/demo-script.md`: record after the
      re-judge has finished and the re-rank animation has landed.
- [ ] Keep it on the pitch laptop, playable offline.

Bring: the demo laptop, a quiet room. Result: the video file, at the place
written in `docs/demo-script.md` (`[TEAM: where the video file lives]`).

### 12. Fill the last markers

- [ ] Search the four docs for `[TEAM:`, `[CHECK:` and
      `[UPDATE AFTER RE-JUDGE]`, and replace each one with the real value or
      "not measured yet".
- [ ] Read every number on the proof slides again from the Trust report,
      including the red-team pass rate once that run is in.

Result: `docs/pitch-deck.md`, `docs/demo-script.md`,
`docs/quality-and-boundaries.md` and this file, with no open markers that
the pitch depends on.

### 13. Rehearse three times

- [ ] Twice in the normal mode, once with `DEMO_MODE=cached`.
- [ ] Time each run against the limit from item 1. Cut slides marked "CUT
      FOR 3 MIN" if needed.
- [ ] Do the pre-demo checklist in `docs/demo-script.md` before each run,
      and switch EmbeddedArt's "Testing and testbeds" priority off again
      after each one.
- [ ] Practise one fallback: stop the live demo at the Copilot and play that
      part of the video.

Bring: the demo laptop, a timer, one listener from outside the team if you
can. Result: the times, and any change to the scripts, in
`docs/pitch-deck.md` and `docs/demo-script.md`.
