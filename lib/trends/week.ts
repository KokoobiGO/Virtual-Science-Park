/**
 * Dates for the trend notes (A27), in Swedish time: a note belongs to the
 * week of the Monday it was written in, whatever the server's own time zone.
 */

const TIME_ZONE = "Europe/Stockholm";

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day in Sweden at `instant`, as YYYY-MM-DD. */
export function swedishDate(instant: Date): string {
  const parts = Object.fromEntries(dayFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const longFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** "2026-12-02" as "2 December 2026". */
export function longDate(day: string): string {
  return longFormat.format(new Date(`${day}T00:00:00Z`));
}

/** The Sunday of the week whose Monday is `weekOf`, as YYYY-MM-DD. */
export function weekEnd(weekOf: string): string {
  const day = new Date(`${weekOf}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 6);
  return day.toISOString().slice(0, 10);
}

/** Monday of the week `now` falls in, in Swedish time, as YYYY-MM-DD (the `week_of` column). */
export function weekOf(now: Date = new Date()): string {
  // Midnight UTC of the Swedish calendar day: plain day arithmetic from here, no time zone left.
  const day = new Date(`${swedishDate(now)}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day.toISOString().slice(0, 10);
}
