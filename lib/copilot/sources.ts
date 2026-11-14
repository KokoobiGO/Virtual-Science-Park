/**
 * Sources of one Copilot turn (B7). Every tool result that carries a URL is
 * registered here and gets a number; the assistant cites that number as [n],
 * and the output check (check.ts) keeps only numbers that exist. So an answer
 * can only cite URLs that a tool really returned, never one the model made up.
 */

/** A source as the member sees it under an answer. Stored in `chats.citations`. */
export type Citation = {
  /** The number the answer uses: [1], [2], ... */
  n: number;
  url: string;
  title: string;
  /** Who published it, e.g. "Vinnova". */
  publisher?: string;
  /** Dates that go with the source, e.g. "closes 2026-12-08", "retrieved 2026-11-14". */
  dates: string[];
  /** Hand-entered by the team rather than collected (the plan's SIMULATED label). */
  simulated?: boolean;
  /** Set when the source is an opportunity, so a follow-up can save or explain it. */
  opportunityId?: string;
};

/** A registered source: a citation plus what the eligibility rewrite needs. */
export type SourceEntry = Citation & {
  /** "Who may apply" from the source text, for the eligibility rewrite. */
  whoMayApply?: string;
};

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in Swedish time, or null. */
export function day(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : dayFormat.format(date);
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
    ...(entry.simulated ? { simulated: true } : {}),
    ...(entry.opportunityId ? { opportunityId: entry.opportunityId } : {}),
  };
}
