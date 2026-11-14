/**
 * The week a set of "Your week" cards is for (A17): the Monday of the current
 * week in Swedish time, whatever the server's own time zone.
 */

const TIME_ZONE = "Europe/Stockholm";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day in Sweden at `instant`, as YYYY-MM-DD. */
export function swedishDate(instant: Date): string {
  return dayFormat.format(instant);
}

/** Monday of the week `now` falls in, in Swedish time, as YYYY-MM-DD (the `week_of` column). */
export function mondayOf(now: Date = new Date()): string {
  // Midnight UTC of the Swedish calendar day: plain day arithmetic from here, no daylight saving left.
  const day = new Date(`${swedishDate(now)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
