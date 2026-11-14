/**
 * The "Add to calendar" file for a card (C4): one iCalendar (RFC 5545) file
 * with an entry for the deadline and one for the event date, whichever the
 * source gives. Pure, so it is unit-tested; the route handler in
 * app/api/calendar/[opportunityId]/route.ts serves it.
 *
 * A date without a time (midnight or 23:59 Swedish time, see isWholeDay)
 * becomes an all-day entry on that Swedish date. A date with a time becomes
 * an entry that starts at that moment: 30 minutes for a deadline, an hour for
 * an event (sources do not give an end time).
 */
import type { OpportunityKind } from "../schemas";
import { isWebLink, isWholeDay, kindLabel } from "./format";

export type CalendarItem = {
  opportunityId: string;
  kind: OpportunityKind;
  title: string;
  url: string;
  source: string;
  deadline: Date | null;
  eventDate: Date | null;
};

const PRODUCT_ID = "-//Virtual Science Park//Your week//EN";
const UID_DOMAIN = "virtual-science-park";

const swedishDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });

/** TEXT values: backslash, semicolon, comma and line breaks are escaped (RFC 5545 3.3.11). */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Lines longer than 75 octets are folded: CRLF plus one space, never inside a character (RFC 5545 3.1). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // The first line holds 75 octets; a continuation line 74 after its leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** 2026-12-03T13:00:00.000Z as 20261203T130000Z. */
export function utcStamp(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The Swedish calendar day of `instant`, as YYYYMMDD. */
function swedishDate(instant: Date): string {
  return swedishDay.format(instant).replace(/-/g, "");
}

/** The day after a YYYYMMDD date, as YYYYMMDD. */
function nextDay(date: string): string {
  const day = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10).replace(/-/g, "");
}

function entry(item: CalendarItem, what: "deadline" | "event", at: Date, now: Date): string[] {
  const summary = what === "deadline" ? `Deadline: ${item.title}` : item.title;
  const when = isWholeDay(at)
    ? [`DTSTART;VALUE=DATE:${swedishDate(at)}`, `DTEND;VALUE=DATE:${nextDay(swedishDate(at))}`]
    : [`DTSTART:${utcStamp(at)}`, `DTEND:${utcStamp(new Date(at.getTime() + (what === "deadline" ? 30 : 60) * 60_000))}`];
  const description = [
    `${kindLabel(item.kind)} from ${item.source}, a potential match from your Virtual Science Park week.`,
    `Check the ${what === "deadline" ? "deadline" : "date"} on the source before you plan on it.`,
    item.url,
  ].join("\n");
  return [
    "BEGIN:VEVENT",
    `UID:${item.opportunityId}-${what}@${UID_DOMAIN}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...when,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(isWebLink(item.url) ? [`URL:${item.url}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

/** The .ics file for one opportunity, or null when it has neither a deadline nor an event date. */
export function buildIcs(item: CalendarItem, { now = new Date() }: { now?: Date } = {}): string | null {
  const entries = [
    ...(item.deadline ? entry(item, "deadline", item.deadline, now) : []),
    ...(item.eventDate ? entry(item, "event", item.eventDate, now) : []),
  ];
  if (!entries.length) return null;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${PRODUCT_ID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...entries, "END:VCALENDAR"];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** A plain ASCII file name for the download, from the title. */
export function icsFileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${base || "opportunity"}.ics`;
}
