/**
 * Dates in Swedish time, in the reader's language (C19). The screens print
 * every date in Europe/Stockholm whatever the server's time zone; this adds
 * the language: "14 Nov 2026" in English, "14 nov. 2026" in Swedish.
 */
import { INTL_LOCALE, type Locale } from "./config";

export const TIME_ZONE = "Europe/Stockholm";

type Style = "day" | "dateTime";

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  // "14 Nov 2026"
  day: { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE },
  // "14 Nov 2026, 09:30"
  dateTime: { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE },
};

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(style: Style, locale: Locale): Intl.DateTimeFormat {
  const key = `${style}|${locale}`;
  let format = cache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALE[locale], OPTIONS[style]);
    cache.set(key, format);
  }
  return format;
}

const toDate = (date: Date | string) => (typeof date === "string" ? new Date(date) : date);

/** "14 Nov 2026" / "14 nov. 2026", Swedish time. */
export function formatDay(date: Date | string, locale: Locale): string {
  return formatter("day", locale).format(toDate(date));
}

/** "14 Nov 2026, 09:30" / "14 nov. 2026 09:30", Swedish time. */
export function formatDateTime(date: Date | string, locale: Locale): string {
  return formatter("dateTime", locale).format(toDate(date));
}

/** The day, or null for no date or one that cannot be read. */
export function formatDayOrNull(date: Date | string | null | undefined, locale: Locale): string | null {
  if (!date) return null;
  const d = toDate(date);
  return Number.isNaN(d.getTime()) ? null : formatDay(d, locale);
}
