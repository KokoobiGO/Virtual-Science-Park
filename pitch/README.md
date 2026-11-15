# Pitch deck

An animated HTML deck for the final pitch: 16 slides in the app's own night
theme, with no libraries and nothing loaded from the internet. The fonts
(Geist and Geist Mono) are in `fonts/`, so the deck also runs offline.

## Open it

Double-click `index.html`, or serve the folder:

```bash
python -m http.server 4321 --directory pitch
```

Then open http://localhost:4321 in Chrome or Edge and press `F` for full
screen. The deck scales to any screen at 16:9.

## Keys

| Key | What it does |
| --- | --- |
| `→` `Space` `PageDown` `Enter`, or a click | Next build or next slide (presentation clickers work) |
| `←` `PageUp` `Backspace`, or a click on the left fifth | Back |
| `F` | Full screen |
| `P` | Presenter window: notes, a clock, the planned time and the next slide (put it on the laptop screen) |
| `N` | Notes along the bottom of this window |
| `O` | All slides; click one to jump |
| a number, then `Enter` | Jump to that slide |
| `B` or `.` | Black screen |
| `T` | Reset the clock |

The address keeps the slide number (`#7`), so a reload stays on the slide.

## Before the pitch

1. Fill in `config.js`: team names, the timed-test and staff-rating results
   (an empty one shows "Not measured yet", never a guess), and the live site.
2. The numbers on slides 6, 9, 10 and 12 come from the Trust report runs of
   14 Nov 2026 (`docs/quality-and-boundaries.md`), made before the app moved
   to Claude. If you re-run `npm run eval` or `npm run check:links`, change
   the numbers in `index.html` and set `proofFootnote` in `config.js`.
   The unit-test count (1,339) is from a run on 15 Nov 2026.
3. Slides 4, 6 and 7 show EmbeddedArt's real cards, quotes and top fives
   from the database (week of 9 Nov 2026). If the cards are rebuilt, check
   that the titles still match what the live demo shows.
4. Rehearse with `P` open on the laptop: each slide's notes say about how many
   seconds it takes (the total is about 6 minutes with a 90-second demo).
   Slide 8 is the cue to switch to the browser; if the live demo works,
   slides 6, 7 and 9 can be quick recaps, and if it fails they are the backup.

## Save a PDF

In Chrome: print (`Ctrl+P`), destination "Save as PDF", "Background graphics"
on, margins "None". Every slide prints fully built, one per page.

## Files

- `index.html`: the slides and the speaker notes (`<aside class="notes">`)
- `deck.css`: the theme and layout, on a 1920 x 1080 canvas
- `deck.js`: transitions, builds, the per-slide animations, presenter window
- `config.js`: the values the team fills in
