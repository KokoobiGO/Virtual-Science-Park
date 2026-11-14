/**
 * The words on the Scout screen that follow rules: page titles, dates, the
 * data status of a citation (D20) and what a failed start says. Pure, so they
 * are unit-tested; scout-client.tsx shows them. Each takes the screen's
 * translator (C19), so the words are in the reader's language.
 *
 * The API's own error sentences are English. They are shown only to an
 * English reader; another language gets the catalogue's sentence for the
 * same case.
 */
import { itemDataStatus, type DataStatusKind } from "@/components/data-status-label";
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/lib/i18n/config";
import { TIME_ZONE } from "@/lib/i18n/format";
import { createTranslator, type Translator } from "@/lib/i18n/translate";
import type { Citation, OptionKind } from "@/lib/scout/types";

type T = Translator<"scout">;

const DATE_OPTIONS = {
  // "14 November 2026" / "14 november 2026"
  day: { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" },
  // "14 Nov, 20:55" / "14 nov. 20:55"
  when: { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
const formats = new Map<string, Intl.DateTimeFormat>();

function format(style: keyof typeof DATE_OPTIONS, locale: Locale): Intl.DateTimeFormat {
  const key = `${style}|${locale}`;
  let found = formats.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(INTL_LOCALE[locale], DATE_OPTIONS[style]);
    formats.set(key, found);
  }
  return found;
}

/** "14 November 2026" ("14 november 2026"), in Swedish time. */
export const day = (iso: string, locale: Locale) => format("day", locale).format(new Date(iso));
/** "14 Nov, 20:55" ("14 nov. 20:55"), in Swedish time. */
export const when = (iso: string, locale: Locale) => format("when", locale).format(new Date(iso));

/** Characters of the question kept in a page title. */
const TITLE_QUESTION_CHARS = 60;

/** The page title: the open brief's question, cut, then "Scout". The layout adds the site name. */
export function scoutTitle(question: string | null | undefined, t: T): string {
  const q = question?.replace(/\s+/g, " ").trim();
  if (!q) return t("title");
  const cut = q.length > TITLE_QUESTION_CHARS ? `${q.slice(0, TITLE_QUESTION_CHARS - 1).trimEnd()}…` : q;
  return t("titleWithQuestion", { question: cut });
}

/** `title` in place of the page's own part of `current` ("<page> · <site>"), keeping the site name the layout added. */
export function withSiteName(current: string, title: string): string {
  const at = current.lastIndexOf(" · ");
  return at === -1 ? title : `${title}${current.slice(at)}`;
}

/** An option's kind: the shared kind names, and "Web page" for a page from a web search. */
export function optionKindName(kind: OptionKind, t: T): string {
  return kind === "other" ? t("option.webPage") : createTranslator(t.locale, "common")(`kinds.${kind}`);
}

/**
 * The label of a citation (D20): a store row typed in by the team is
 * "Hand-entered", one from a source shown from its recorded copy is "Cached
 * copy" with the copy's date. Web hits and citations without a status get none.
 */
export function citationStatus(citation: Citation): { kind: DataStatusKind; date: string | null } | null {
  if (citation.origin !== "store" || (citation.simulated === undefined && citation.sourceState == null)) return null;
  const kind = itemDataStatus({ simulated: citation.simulated ?? false, sourceState: citation.sourceState });
  if (!kind) return null;
  return { kind, date: kind === "cached" ? (citation.sourceCachedAt ?? citation.retrievedAt) : null };
}

/**
 * How the cited text was read: a stored copy of the page (DEMO_MODE=cached),
 * the page itself, a funder's live search during the run (B1), or the stored record.
 */
export function retrievalText(
  citation: Pick<Citation, "pageRead" | "pageStored" | "retrievedAt" | "liveSource" | "liveRetrievedAt">,
  t: T,
): string {
  const date = day(citation.retrievedAt, t.locale);
  if (citation.pageRead && citation.pageStored) return t("option.pageStored", { day: date });
  if (citation.pageRead) return t("option.pageRead", { day: date });
  if (citation.liveRetrievedAt) {
    const at = when(citation.liveRetrievedAt, t.locale);
    return citation.liveSource ? t("option.liveResult", { source: citation.liveSource, when: at }) : t("option.liveResultNoSource", { when: at });
  }
  return t("option.retrieved", { day: date });
}

/** Where a citation came from: the opportunity store, a funder's live search, or a web search. */
export function originText(citation: Pick<Citation, "origin">, t: T): string {
  return t(citation.origin === "store" ? "option.fromStore" : citation.origin === "live" ? "option.fromLive" : "option.fromWeb");
}

/** Why "Ask Scout" did not start a run, said next to the question box. The question always stays in the box. */
export type AskFailure = {
  message: string;
  /** Signed out: offer the sign-in page. */
  signIn: boolean;
  /** A brief that is already running, to open below. */
  runningId: string | null;
};

/** The API's own sentence, for an English reader only (see the top of this file). */
function apiSaid(body: { error?: unknown } | null, t: T): string | null {
  if (t.locale !== DEFAULT_LOCALE) return null;
  return typeof body?.error === "string" && body.error.trim() ? body.error.trim() : null;
}

/** What the page says for a refused or failed start, from the HTTP status and the JSON body (null when it was not JSON). */
export function askFailure(status: number, body: { error?: unknown; id?: unknown } | null, t: T): AskFailure {
  const said = apiSaid(body, t);
  const kept = t("failures.kept");
  const id = typeof body?.id === "string" ? body.id : null;
  if (status === 401) return { message: `${t("failures.signedOut")} ${kept}`, signIn: true, runningId: null };
  if (status === 403) return { message: said ?? t("failures.membersOnly"), signIn: false, runningId: null };
  if (status === 409) return { message: `${t("failures.busy")} ${kept}`, signIn: false, runningId: id };
  if (status === 400) return { message: `${said ?? t("failures.unreadable")} ${kept}`, signIn: false, runningId: null };
  return { message: `${t("failures.notStarted", { status })} ${kept}`, signIn: false, runningId: null };
}

/** The request never got an answer: offline, or the server is down. */
export function networkFailure(t: T): AskFailure {
  return { message: `${t("failures.network")} ${t("failures.kept")}`, signIn: false, runningId: null };
}

/**
 * A brief that could not be opened. `error.message` is the API's sentence (or
 * the browser's, offline), shown to an English reader as before; another
 * language gets the HTTP status, or "no connection".
 */
export function openFailure(error: { message: string; status?: number }, t: T): string {
  const detail =
    t.locale === DEFAULT_LOCALE ? error.message : error.status ? t("notices.errorStatus", { status: error.status }) : t("notices.noConnection");
  return t("notices.openFailed", { error: detail });
}
