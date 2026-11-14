/**
 * Labels and dates for the "Your week" screen (C3). Pure, so they are
 * unit-tested. Every date is shown in Swedish time, whatever the server's own
 * time zone.
 */
import type { OpportunityKind } from "../schemas";

const TIME_ZONE = "Europe/Stockholm";

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

const KIND_LABELS: Record<OpportunityKind, string> = {
  funding: "Funding call",
  testbed: "Testbed",
  event: "Event",
  news: "News",
};

export function kindLabel(kind: OpportunityKind): string {
  return KIND_LABELS[kind];
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
export function formatWhen(instant: Date): string {
  const day = dayFormat.format(instant);
  return isWholeDay(instant) ? day : `${day}, ${swedishTime(instant)}`;
}

/** The `week_of` date (a Monday, YYYY-MM-DD) as "9 Nov 2026". */
export function weekLabel(weekOf: string): string {
  return weekFormat.format(new Date(`${weekOf}T00:00:00Z`));
}

export type CardDate = { label: "Deadline" | "Event date"; text: string; passed: boolean };

/** The dates a card shows: the deadline and the event date, when the source gives them. */
export function cardDates({ deadline, eventDate }: { deadline: Date | null; eventDate: Date | null }, now: Date = new Date()): CardDate[] {
  const dates: CardDate[] = [];
  if (deadline) dates.push({ label: "Deadline", text: formatWhen(deadline), passed: deadline < now });
  if (eventDate) dates.push({ label: "Event date", text: formatWhen(eventDate), passed: eventDate < now });
  return dates;
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
