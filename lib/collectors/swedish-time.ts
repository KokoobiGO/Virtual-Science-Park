/**
 * Swedish wall-clock time to instants. Sweden is UTC+1 in winter and UTC+2 in
 * summer, so a fixed "+01:00" puts every summer date an hour late: a deadline
 * day's 23:59 became 00:59 the next day. Brussels keeps the same clock (CET,
 * same switch days), so EU dates read the same way.
 */

const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", timeZoneName: "longOffset" });

/** Stockholm's offset at an instant: "+01:00" in winter, "+02:00" in summer. */
export function stockholmOffset(instant: Date): string {
  const name = offsetFormat.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value ?? "GMT+01:00";
  return name === "GMT" ? "+00:00" : name.slice(3);
}

/**
 * Swedish wall-clock time without an offset ("2027-06-15T23:59:00") with the
 * offset that applies at that moment ("2027-06-15T23:59:00+02:00").
 */
export function withSwedishOffset(wall: string): string {
  let offset = "+01:00";
  // Twice is enough: the first guess is at most an hour off.
  for (let i = 0; i < 2; i++) {
    const next = stockholmOffset(new Date(wall + offset));
    if (next === offset) break;
    offset = next;
  }
  return wall + offset;
}

/** 00:00 Swedish time on a calendar day ("2027-06-15" is 2027-06-14T22:00Z). */
export function startOfSwedishDay(day: string): Date {
  return new Date(withSwedishOffset(`${day}T00:00:00`));
}

/** 23:59 Swedish time on a calendar day, when a deadline day closes ("2027-06-15" is 21:59Z). */
export function endOfSwedishDay(day: string): Date {
  return new Date(withSwedishOffset(`${day}T23:59:00`));
}

/**
 * A collected date as an instant. A calendar day ("2027-06-15") is read in
 * Swedish time: its start, or 23:59 for a deadline. A date-time keeps its own
 * offset. Throws on anything that is not a date.
 */
export function toInstant(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDay ? (endOfDay ? endOfSwedishDay(value) : startOfSwedishDay(value)) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Not a date: ${value}`);
  return date;
}
