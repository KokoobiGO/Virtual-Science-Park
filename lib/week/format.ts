/**
 * Labels and dates for the "Your week" screen (C3). Pure, so they are
 * unit-tested. Every date is shown in Swedish time, whatever the server's own
 * time zone, and in the reader's language (C19; English when left out, which
 * the calendar file, the handoff and the digest rely on).
 */
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "../i18n/config";
import { createTranslator, MESSAGES } from "../i18n/translate";
import type { OpportunityKind } from "../schemas";

const TIME_ZONE = "Europe/Stockholm";
const DAY_MS = 86_400_000;

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** YYYY-MM-DD of the Swedish day, for counting days. */
const isoDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** "3 Dec 2026" / "3 dec. 2026" in `timeZone`. */
function dayFormat(locale: Locale, timeZone: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}`;
  let format = dayFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone, day: "numeric", month: "short", year: "numeric" });
    dayFormats.set(key, format);
  }
  return format;
}

/** "Funding call", "Testbed" ... in the reader's language (English by default). */
export function kindLabel(kind: OpportunityKind, locale: Locale = DEFAULT_LOCALE): string {
  return MESSAGES[locale].week.kinds[kind];
}

/** The time of day in Sweden at `instant`, as HH:MM. */
export function swedishTime(instant: Date): string {
  return timeFormat.format(instant);
}

/**
 * Sources give a date without a time as midnight or 23:59 Swedish time, so
 * those are whole days: no time is shown and the calendar entry is all-day.
 */
export function isWholeDay(instant: Date): boolean {
  const time = swedishTime(instant);
  return time === "00:00" || time === "23:59";
}

/** "3 Dec 2026", or "3 Dec 2026, 14:00" when the source gives a time. */
export function formatWhen(instant: Date, locale: Locale = DEFAULT_LOCALE): string {
  const day = dayFormat(locale, TIME_ZONE).format(instant);
  return isWholeDay(instant) ? day : `${day}, ${swedishTime(instant)}`;
}

/** The `week_of` date (a Monday, YYYY-MM-DD) as "9 Nov 2026". */
export function weekLabel(weekOf: string, locale: Locale = DEFAULT_LOCALE): string {
  return dayFormat(locale, "UTC").format(new Date(`${weekOf}T00:00:00Z`));
}

export type CardDate = { label: "Deadline" | "Event date"; text: string; passed: boolean };

/** The dates a card shows: the deadline and the event date, when the source gives them. `label` names which one. */
export function cardDates(
  { deadline, eventDate }: { deadline: Date | null; eventDate: Date | null },
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): CardDate[] {
  const dates: CardDate[] = [];
  if (deadline) dates.push({ label: "Deadline", text: formatWhen(deadline, locale), passed: deadline < now });
  if (eventDate) dates.push({ label: "Event date", text: formatWhen(eventDate, locale), passed: eventDate < now });
  return dates;
}

/** "Not open yet: opens 1 Dec 2026" for a call whose opening date is still ahead; null once it is open or without a date. */
export function notOpenYetLabel(opensAt: Date | null, now: Date = new Date(), locale: Locale = DEFAULT_LOCALE): string | null {
  if (!opensAt || opensAt.getTime() <= now.getTime()) return null;
  return createTranslator(locale, "week")("card.notOpenYet", { date: formatWhen(opensAt, locale) });
}

/** How close a date is, for the label next to it. Shown with an icon and words, never colour alone. */
export type Urgency =
  | { level: "passed" }
  | { level: "today" }
  | { level: "tomorrow" }
  /** 2 to 7 days ahead. */
  | { level: "soon"; days: number }
  /** 8 to 30 days ahead. */
  | { level: "upcoming"; days: number }
  /** More than 30 days ahead, in whole weeks. */
  | { level: "later"; weeks: number };

/** Whole Swedish calendar days from `now` to `instant` (0 on the same Swedish day). */
function swedishDaysBetween(now: Date, instant: Date): number {
  const day = (d: Date) => Date.parse(`${isoDayFormat.format(d)}T00:00:00Z`);
  return Math.round((day(instant) - day(now)) / DAY_MS);
}

/**
 * How close a deadline or event date is, counted in Swedish calendar days.
 * A date without a time (midnight or 23:59) lasts the whole day, so it is
 * "today" until that day ends.
 */
export function dateUrgency(instant: Date, now: Date = new Date()): Urgency {
  const days = swedishDaysBetween(now, instant);
  if (days < 0) return { level: "passed" };
  if (days === 0) return !isWholeDay(instant) && instant.getTime() < now.getTime() ? { level: "passed" } : { level: "today" };
  if (days === 1) return { level: "tomorrow" };
  if (days <= 7) return { level: "soon", days };
  if (days <= 30) return { level: "upcoming", days };
  return { level: "later", weeks: Math.floor(days / 7) };
}

/** The words for an urgency: "Closes in 3 days", "In 2 weeks", "Deadline passed" ... */
export function urgencyText(kind: "deadline" | "event", urgency: Urgency, locale: Locale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale, "week");
  switch (urgency.level) {
    case "passed":
    case "today":
    case "tomorrow":
      return t(`urgency.${kind}.${urgency.level}`);
    case "soon":
    case "upcoming":
      return t(`urgency.${kind}.days`, { count: urgency.days });
    case "later":
      return t(`urgency.${kind}.weeks`, { count: urgency.weeks });
  }
}

/** A source's title, or its host name when it has none. */
export function sourceLabel({ url, title }: { url: string; title?: string }): string {
  if (title?.trim()) return title.trim();
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Only http(s) links are shown as links; anything else could run script in the page. */
export function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The .ics download for an opportunity (app/api/calendar/[opportunityId]/route.ts). */
export function calendarHref(opportunityId: string): string {
  return `/api/calendar/${opportunityId}`;
}
