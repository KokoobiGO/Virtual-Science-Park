/**
 * Sources of one Copilot turn (B7). Every tool result that carries a URL is
 * registered here and gets a number; the assistant cites that number as [n],
 * and the output check (check.ts) keeps only numbers that exist. So an answer
 * can only cite URLs that a tool really returned, never one the model made up.
 */
import { formatStatusDate, itemDataStatus } from "../../components/data-status-label";
import type { SourceState } from "../schemas";

/**
 * The data label a source carries (D20, components/data-status-label.tsx).
 * Absent for data read live from its source.
 *
 * - hand_entered: an opportunity the team typed in from the source.
 * - simulated: sample data the team wrote, such as page text behind a profile quote.
 * - cached: an opportunity from a source whose recorded copy is in use; `cachedAt` is the copy's date.
 */
export type CitationLabel = "hand_entered" | "simulated" | "cached";

/** A source as the member sees it under an answer. Stored in `chats.citations`. */
export type Citation = {
  /** The number the answer uses: [1], [2], ... */
  n: number;
  url: string;
  title: string;
  /** Who published it, e.g. "Vinnova". */
  publisher?: string;
  /** Dates that go with the source, as the screens write them: "closes 8 Dec 2026", "retrieved 14 Nov 2026". */
  dates: string[];
  /** Hand-entered, simulated or a cached copy; absent for data read live. */
  label?: CitationLabel;
  /** With label "cached": the date of the copy (ISO), or absent when it is not known. */
  cachedAt?: string;
  /** Set when the source is an opportunity, so a follow-up can save or explain it. */
  opportunityId?: string;
  /**
   * INJECTION_LABEL (lib/injection/detect.ts) when the source's text looks
   * like instructions to an AI. The text was given to the model as data only.
   */
  warning?: string;
};

/** A registered source: a citation plus what the eligibility rewrite needs. */
export type SourceEntry = Citation & {
  /** "Who may apply" from the source text, for the eligibility rewrite. */
  whoMayApply?: string;
};

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * YYYY-MM-DD in Swedish time, or null. For the model only: the prompt asks it
 * to give dates exactly as the tools do, and closesBefore takes this form.
 */
export function day(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : dayFormat.format(date);
}

/** "14 Nov 2026" in Swedish time, as every screen writes a date; for the dates a citation shows. */
export const shownDay = formatStatusDate;

/** The label of an opportunity source (itemDataStatus), or undefined for one read live. */
export function opportunityLabel(o: { simulated: boolean; externalId?: string | null; sourceState?: SourceState | null }): CitationLabel | undefined {
  const kind = itemDataStatus(o);
  return kind === "hand_entered" || kind === "simulated" || kind === "cached" ? kind : undefined;
}

/** Only web links and our own pages may be shown as links. */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url);
}

export class SourceRegistry {
  private readonly entries: SourceEntry[] = [];

  /** The number for this URL; the same URL always gets the same number. */
  add(source: Omit<SourceEntry, "n">): number {
    const existing = this.entries.find((e) => e.url === source.url);
    if (existing) {
      // Keep the richer record: later tools may know more about the same page.
      existing.whoMayApply ??= source.whoMayApply;
      existing.opportunityId ??= source.opportunityId;
      existing.warning ??= source.warning;
      // A label is never lost: the same page as simulated text elsewhere stays labelled.
      if (!existing.label && source.label) {
        existing.label = source.label;
        if (source.cachedAt) existing.cachedAt = source.cachedAt;
      }
      for (const d of source.dates) if (!existing.dates.includes(d)) existing.dates.push(d);
      return existing.n;
    }
    if (!isSafeUrl(source.url)) return 0;
    const n = this.entries.length + 1;
    this.entries.push({ ...source, n, dates: [...source.dates] });
    return n;
  }

  get(n: number): SourceEntry | undefined {
    return this.entries.find((e) => e.n === n);
  }

  all(): readonly SourceEntry[] {
    return this.entries;
  }

  get size(): number {
    return this.entries.length;
  }
}

/** A citation without the fields only the check needs. */
export function toCitation(entry: SourceEntry, n = entry.n): Citation {
  return {
    n,
    url: entry.url,
    title: entry.title,
    ...(entry.publisher ? { publisher: entry.publisher } : {}),
    dates: entry.dates,
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.label === "cached" && entry.cachedAt ? { cachedAt: entry.cachedAt } : {}),
    ...(entry.opportunityId ? { opportunityId: entry.opportunityId } : {}),
    ...(entry.warning ? { warning: entry.warning } : {}),
  };
}
