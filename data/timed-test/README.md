# Timed test: from paper to results.json

After the session, type the record sheets (`record-sheet.md`, one sheet per
run) into `results.json` in this folder. The Trust report (`/trust`) reads that
file; while it is not there, the report says "not measured yet". Copy
`results.example.json` to start: same shape, invented numbers.

## The file

```json
{
  "date": "2026-11-20",
  "keyItems": { "A": 2, "B": 5 },
  "trials": [
    { "participant": "P1", "task": "A", "method": "without_app", "seconds": 900, "completed": false, "found": 2, "points": 1 },
    { "participant": "P1", "task": "A", "method": "with_app", "seconds": 250, "completed": true, "found": 3, "points": 2 }
  ],
  "notes": "Anything a reader needs to weigh the numbers."
}
```

## Field by field

| Field | Where it is on the paper | What to type |
| --- | --- | --- |
| `date` | Date | The day of the session, `YYYY-MM-DD`. |
| `keyItems` | `answer-key.md` | Optional. Per task, how many items count in the confirmed key: the "Believed correct" rows plus the "Unsure" rows ticked "counts" (and B14 to B18 if that group was ticked "these count"). With it the report says "2 of 5 points". Leave it out if the key was not confirmed. |
| `trials` | one record sheet each | One entry per sheet. |
| `participant` | Tester | `P1`, `P2` ... Never a name: the file refuses anything else. |
| `task` | Task | `"A"` (test facilities for an underwater sensor) or `"B"` (funding for Techinova). |
| `method` | Method | By hand: `"without_app"`. With the tool: `"with_app"`. |
| `seconds` | Time used | Minutes times 60 plus seconds: 4 min 10 s is `250`. 15 minutes is `900`, the most allowed. |
| `completed` | How it ended | `true` when the tester said "done"; `false` when they gave up or the 15 minutes ran out. |
| `found` | Results found | How many results the tester gave. |
| `points` | Correct (points) | The results scored "yes" against the key, each item once, after the team decided on the "check" ones. Never more than `found`. |
| `note` | Notes, Where the tester got stuck | Optional, one short line per trial. |
| `notes` | | Optional, for the whole session. |

Rules the file checks: one trial per tester, task and method (if a run had
to be done again, type only the one that counts); `points` at most `found`,
and at most `keyItems` for that task when it is given. Names, extra keys
and typos in the values are refused.

## Check it

Open `/trust` on the local site (`npm run dev`, http://localhost:3000/trust).
The Timed test card shows one row per task and tester, by hand next to with
the tool. If the card says the file cannot be read, the line under it says
which field is wrong.
