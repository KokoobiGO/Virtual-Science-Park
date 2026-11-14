/**
 * Finds an event's date in free text (A25). WordPress only gives the date a
 * post was published; the event date is written in the title or the text,
 * usually in Swedish: "27 november 2026 kl. 13.00", "tis 2 dec", "3-4 december",
 * "Datum 19, 24, 26, 30 nov", "2026-12-02", or in English: "April 14, 2026".
 *
 * The first date in the text wins. A range or a list of days gives its first
 * day. A time right after the date ("kl. 13.00", "13:00", "Tid: 10:00-13:00")
 * gives a date-time with the Swedish offset; otherwise the result is a date.
 */

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  maj: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  augusti: 8, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/** Longest first, so "december" wins over "dec". */
const MONTH = `(${Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|")})`;
/** 1st, 2nd, 3rd, 4th, 2:a, 3:e. */
const ORDINAL = "(?:st|nd|rd|th|:a|:e)?";
/** Between the days of a range or list: "3-4", "3\u20134", "19, 24", "3 och 4", "3 and 4". */
const JOIN = "\\s*(?:,|-|\u2013|\u2014|och|and|&|to|till)\\s*";
const NO_LETTER_AFTER = "(?![a-z\u00e5\u00e4\u00f6\u00e9])";
const YEAR = "(?:,?\\s+(\\d{4})(?!\\d))?";

/** Day first: "3 december", "3-4 dec.", "19, 24, 26, 30 nov", "2 December 2026". */
const DAY_MONTH = new RegExp(
  `(?<![\\w.:/-])(\\d{1,2})${ORDINAL}\\.?(?:${JOIN}\\d{1,2}${ORDINAL}\\.?)*\\s+(?:of\\s+)?${MONTH}\\.?${NO_LETTER_AFTER}${YEAR}`,
  "gi",
);
/** A day number is not part of a longer number or a time: not "20" in "2026", not "10" in "10:30". */
const WHOLE_DAY = "(?!\\d|[:.]\\d)";
/** Month first (English): "April 14, 2026", "December 3-4", "Feb 26". Not "maj 2026". */
const MONTH_DAY = new RegExp(
  `(?<![a-z\u00e5\u00e4\u00f6\u00e9])${MONTH}\\.?\\s+(\\d{1,2})${ORDINAL}${WHOLE_DAY}(?:${JOIN}\\d{1,2}${ORDINAL}${WHOLE_DAY})*${YEAR}`,
  "gi",
);
/** Numeric: "2026-12-02". */
const ISO = /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g;

/**
 * A time right after the date. Minutes are needed unless "kl." or am/pm says
 * it is a time, so "3 december 2 platser" is not read as 02:00.
 */
const TIME_AFTER =
  /^\s*(?:[,;\u2013\u2014-]\s*)?(?:(T|kl\.?|klockan|tid:?|time:?|at|fr\u00e5n|from)\s*)?(\d{1,2})(?:[:.](\d{2}))?(?!\d)(?:\s*([ap])\.?m\.?(?![a-z]))?/i;

/**
 * When the year is missing, the date is taken in the first year that puts it
 * on or after the published date minus this many days. The grace is there
 * because posts are often published after a series has started: TCL's
 * "Future Lab" posts were published on 10 March and list "26 February" first.
 */
export const YEAR_GRACE_DAYS = 90;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Day of the month of the last Sunday (DST starts and ends on one). */
function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/** Swedish summer time: last Sunday of March 02:00 to last Sunday of October 03:00, local time. */
function isSummerTime(year: number, month: number, day: number, hour: number): boolean {
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;
  const switchDay = lastSunday(year, month);
  if (month === 3) return day > switchDay || (day === switchDay && hour >= 2);
  return day < switchDay || (day === switchDay && hour < 3);
}

/** The calendar day in Sweden at this instant, e.g. "2026-11-14". */
export function swedishDay(instant: Date): string {
  const year = instant.getUTCFullYear();
  const start = Date.UTC(year, 2, lastSunday(year, 3), 1);
  const end = Date.UTC(year, 9, lastSunday(year, 10), 1);
  const t = instant.getTime();
  const offsetHours = t >= start && t < end ? 2 : 1;
  return new Date(t + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

type Time = { hour: number; minute: number };

function readTime(after: string): Time | undefined {
  const m = TIME_AFTER.exec(after);
  if (!m) return undefined;
  const [, keyword, h, min, ampm] = m;
  const sure = min !== undefined || ampm !== undefined || /^(kl|klockan)/i.test(keyword ?? "");
  if (!sure) return undefined;
  let hour = Number(h);
  const minute = Number(min ?? 0);
  if (ampm) {
    if (hour < 1 || hour > 12) return undefined;
    if (ampm.toLowerCase() === "p" && hour < 12) hour += 12;
    if (ampm.toLowerCase() === "a" && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return undefined;
  return { hour, minute };
}

function resolveYear(month: number, day: number, publishedAt: Date): number | undefined {
  const floor = swedishDay(new Date(publishedAt.getTime() - YEAR_GRACE_DAYS * DAY_MS));
  const first = Number(floor.slice(0, 4));
  for (let year = first; year <= first + 2; year++) {
    if (day > daysInMonth(year, month)) continue; // 29 February
    if (`${year}-${pad(month)}-${pad(day)}` >= floor) return year;
  }
  return undefined;
}

function toIso(year: number, month: number, day: number, time: Time | undefined): string {
  const date = `${year}-${pad(month)}-${pad(day)}`;
  if (!time) return date;
  const offset = isSummerTime(year, month, day, time.hour) ? "+02:00" : "+01:00";
  return `${date}T${pad(time.hour)}:${pad(time.minute)}:00${offset}`;
}

type Candidate = { index: number; end: number; year?: number; month: number; day: number };

function candidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const m of text.matchAll(DAY_MONTH)) {
    found.push({ index: m.index, end: m.index + m[0].length, day: Number(m[1]), month: MONTHS[m[2].toLowerCase()], year: m[3] ? Number(m[3]) : undefined });
  }
  for (const m of text.matchAll(MONTH_DAY)) {
    found.push({ index: m.index, end: m.index + m[0].length, month: MONTHS[m[1].toLowerCase()], day: Number(m[2]), year: m[3] ? Number(m[3]) : undefined });
  }
  for (const m of text.matchAll(ISO)) {
    found.push({ index: m.index, end: m.index + m[0].length, year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
  }
  return found.sort((a, b) => a.index - b.index);
}

/**
 * The first event date in the text as an ISO date ("2026-12-02") or date-time
 * with the Swedish offset ("2026-12-02T13:00:00+01:00"), or undefined when
 * the text has none. `publishedAt` decides the year when the text leaves it out.
 */
export function findEventDate(text: string, publishedAt: Date): string | undefined {
  for (const c of candidates(text)) {
    if (c.month < 1 || c.month > 12 || c.day < 1) continue;
    const year = c.year !== undefined && c.year >= 2000 && c.year <= 2099 ? c.year : resolveYear(c.month, c.day, publishedAt);
    if (year === undefined || c.day > daysInMonth(year, c.month)) continue;
    return toIso(year, c.month, c.day, readTime(text.slice(c.end, c.end + 40)));
  }
  return undefined;
}
