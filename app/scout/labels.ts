/**
 * The words on the Scout screen that follow rules: page titles, the data
 * status of a citation (D20) and what a failed start says. Pure, so they are
 * unit-tested; scout-client.tsx shows them.
 */
import { itemDataStatus, type DataStatusKind } from "@/components/data-status-label";
import type { Citation } from "@/lib/scout/types";

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "14 November 2026", in Swedish time. */
export const day = (iso: string) => dayFormat.format(new Date(iso));
/** "14 Nov, 20:55", in Swedish time. */
export const when = (iso: string) => timeFormat.format(new Date(iso));

/** Characters of the question kept in a page title. */
const TITLE_QUESTION_CHARS = 60;

/** The page title: the open brief's question, cut, then "Scout". The layout adds the site name. */
export function scoutTitle(question: string | null | undefined): string {
  const q = question?.replace(/\s+/g, " ").trim();
  if (!q) return "Scout";
  const cut = q.length > TITLE_QUESTION_CHARS ? `${q.slice(0, TITLE_QUESTION_CHARS - 1).trimEnd()}…` : q;
  return `${cut} · Scout`;
}

/** `title` in place of the page's own part of `current` ("<page> · <site>"), keeping the site name the layout added. */
export function withSiteName(current: string, title: string): string {
  const at = current.lastIndexOf(" · ");
  return at === -1 ? title : `${title}${current.slice(at)}`;
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

/** How the cited text was read: a stored copy of the page (DEMO_MODE=cached), the page itself, or the stored record. */
export function retrievalText(citation: Pick<Citation, "pageRead" | "pageStored" | "retrievedAt">): string {
  if (citation.pageRead && citation.pageStored) return `stored copy of the page from ${day(citation.retrievedAt)}`;
  if (citation.pageRead) return `page read by Scout on ${day(citation.retrievedAt)}`;
  return `retrieved ${day(citation.retrievedAt)}`;
}

/** Why "Ask Scout" did not start a run, said next to the question box. The question always stays in the box. */
export type AskFailure = {
  message: string;
  /** Signed out: offer the sign-in page. */
  signIn: boolean;
  /** A brief that is already running, to open below. */
  runningId: string | null;
};

const KEPT = "Your question is still in the box.";

/** What the page says for a refused or failed start, from the HTTP status and the JSON body (null when it was not JSON). */
export function askFailure(status: number, body: { error?: unknown; id?: unknown } | null): AskFailure {
  const said = typeof body?.error === "string" && body.error.trim() ? body.error.trim() : null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (status === 401) {
    return {
      message: `You are signed out, so Scout could not start. Sign in again in a new tab, then come back here and press Ask Scout. ${KEPT}`,
      signIn: true,
      runningId: null,
    };
  }
  if (status === 403) return { message: said ?? "Scout is for member companies only.", signIn: false, runningId: null };
  if (status === 409) {
    return {
      message: `Scout is still working on your last question, and it answers one at a time. Wait until that brief is done (it is open below), then ask again. ${KEPT}`,
      signIn: false,
      runningId: id,
    };
  }
  if (status === 400) return { message: `${said ?? "The question could not be read."} ${KEPT}`, signIn: false, runningId: null };
  return { message: `Scout could not be started (error ${status}). Try again in a moment. ${KEPT}`, signIn: false, runningId: null };
}

/** The request never got an answer: offline, or the server is down. */
export const NETWORK_FAILURE: AskFailure = {
  message: `Scout could not be reached. Check your connection and try again. ${KEPT}`,
  signIn: false,
  runningId: null,
};
