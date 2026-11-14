# Staff session: from paper to results.json

After the session, type the ticked rating sheets in this folder into
`results.json` here. The Trust report (`/trust`) reads that file; while it is
not there, the report says "not measured yet". Copy `results.example.json` to
start: same shape, invented ratings.

The sheets:

- `claims-<member>.md`: each profile claim, ticked right / wrong / unsure.
- `top5-<member>.md`: the top five public matches, ticked relevant / not relevant.
- `think-aloud.md`: notes, and exact quotes with "Permission to quote".

## The file

```json
{
  "date": "2026-11-21",
  "staff": 2,
  "members": [
    {
      "member": "embeddedart",
      "claims": [
        { "claim": 1, "rating": "right" },
        { "claim": 2, "rating": "unsure", "note": "Monitoring of what?" }
      ],
      "top5": [
        { "match": 1, "rating": "relevant" },
        { "match": 2, "rating": "not_relevant" }
      ]
    }
  ],
  "quotes": [
    { "text": "I would check the deadline on the funder's own page first.", "permission": true }
  ],
  "notes": "Anything a reader needs to weigh the numbers."
}
```

## Field by field

| Field | Where it is on the paper | What to type |
| --- | --- | --- |
| `date` | Date | The day of the session, `YYYY-MM-DD`. |
| `staff` | Rated by | How many BSP staff took part (a number, no names). |
| `members` | one entry per member | One per gold member whose sheets were rated. |
| `member` | the sheet's file name | `claims-embeddedart.md` is `"embeddedart"`; also `"malvacom"`, `"techinova"`. |
| `claims` | `claims-<member>.md` | One entry per ticked box. An empty list `[]` if the sheet was not rated. |
| `claim` | the heading number | `## 2. Offerings` is `2`. |
| `rating` (claims) | the ticked box | `"right"`, `"wrong"` or `"unsure"`. A claim with no box ticked is left out. |
| `top5` | `top5-<member>.md` | One entry per ticked box. `[]` if the sheet was not rated. |
| `match` | the heading number | `## 3. Unmanned systems ...` is `3` (1 to 5). |
| `rating` (top5) | the ticked box | `"relevant"` or `"not_relevant"`. |
| `note` | Notes | Optional, one short line. |
| `rater` | Rated by | Only when two people rated the same sheet separately: `"S1"`, `"S2"` (never a name), one entry per person per claim. Leave it out otherwise. |
| `quotes` | `think-aloud.md`, Exact quotes | Optional. One entry per quote, word for word. |
| `text` | the quote | Without the quote marks. |
| `permission` | Permission to quote | `true` only when "yes" is ticked; `false` for "no" or nothing ticked. |
| `notes` | | Optional, for the whole session. |

The report shows, per member, the share of claims rated right and the share
of matches rated relevant, each with the number rated. It shows only the
quotes with `"permission": true`, and counts the others without showing them.

Rules the file checks: each member once; each claim and each match once per
rater; `match` from 1 to 5; anonymous labels only. Extra keys and typos in
the values are refused.

## Check it

Open `/trust` on the local site (`npm run dev`, http://localhost:3000/trust).
If the Staff session card says the file cannot be read, the line under it
says which field is wrong.
