/**
 * Dates on the explorer, shown in Swedish time: BSP is in Karlskrona, and the
 * sources store a deadline such as "23:59 on 1 December" as 22:59 UTC.
 */
export const TIME_ZONE = "Europe/Stockholm";

export const DAY_MS = 86_400_000;

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, month: "long", year: "numeric" });
const shortMonthFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, month: "short" });
const partsFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Year, month and day of `date` in Swedish time. */
function localParts(date: Date): { year: number; month: number; day: number } {
  const parts = partsFormat.formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** "1 Dec 2027". */
export function formatDay(date: Date): string {
  return dayFormat.format(date);
}

/** "2027-12", the month in Swedish time. */
export function monthKey(date: Date): string {
  const { year, month } = localParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The first moment of a month key, in UTC: only for labels, so the hour does not matter. */
function monthStart(key: string): Date {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 15));
}

/** "December 2027". */
export function monthLabel(key: string): string {
  return monthFormat.format(monthStart(key));
}

/** "Dec". */
export function shortMonthLabel(key: string): string {
  return shortMonthFormat.format(monthStart(key));
}

/** Every month key from `first` to `last`, both included. */
export function monthRange(first: string, last: string): string[] {
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const keys: string[] = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return keys;
}

/** Calendar days from today until the day of `date`, in Swedish time: 1 is tomorrow, 0 today or passed. */
export function daysUntil(date: Date, now: Date): number {
  const dayNumber = (d: Date) => {
    const { year, month, day } = localParts(d);
    return Date.UTC(year, month - 1, day) / DAY_MS;
  };
  return Math.max(0, dayNumber(date) - dayNumber(now));
}
