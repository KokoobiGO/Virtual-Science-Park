/**
 * Which matches become the "Your week" cards (A17). Pure, so the rules are
 * unit-tested. No model call: a card reuses the judge's text.
 *
 * From the company's personal matches that are ranked, judged and not
 * rejected, in rank order, up to 6 cards: at most 3 of one kind and at most 2
 * from one source. News is skipped (it feeds the trend notes instead). When
 * fewer than 5 pass, the source rule is relaxed first, then the kind rule,
 * until there are 5 or the matches run out.
 *
 * Open items come first: a call whose opening date is still ahead (`opensAt`
 * after `now`) may take a card slot only when fewer than 5 open items pass,
 * and then only up to 5, after the open ones (it cannot be applied to yet).
 * The card itself says "Not open yet" (app/week/week-card.tsx).
 *
 * Then one trend card, when this week has a trend note for one of the
 * company's tags, at the last position. So a company gets 5 to 7 cards (fewer
 * only when it has fewer usable matches).
 */
import type { OpportunityKind } from "../schemas";

export const CARD_RULES = { max: 6, min: 5, maxPerKind: 3, maxPerSource: 2 } as const;

export const TREND_NEXT_STEP = "Read the sources and see whether it changes your plans.";

export type CardSource = { url: string; title?: string };

/** A personal match row as the selection needs it. */
export type CardCandidate = {
  matchId: string;
  opportunityId: string;
  rank: number | null;
  judged: boolean;
  rejected: boolean;
  kind: OpportunityKind;
  source: string;
  title: string;
  url: string;
  /** When the call opens; null when the source gives no opening date. */
  opensAt: Date | null;
  why: string | null;
  nextStep: string | null;
  uncertainties: string[];
};

export type TrendNoteForCard = { id: string; area: string; weekOf: string; title: string; body: string; sources: CardSource[] };

/** A card before it is stored: the week_cards columns without company and week. */
export type CardDraft = {
  position: number;
  kind: "match" | "trend";
  opportunityId: string | null;
  trendNoteId: string | null;
  title: string;
  why: string;
  nextStep: string;
  uncertainties: string[];
  sources: CardSource[];
};

type Limits = { perKind: number; perSource: number };

const STRICT: Limits = { perKind: CARD_RULES.maxPerKind, perSource: CARD_RULES.maxPerSource };
const ANY_SOURCE: Limits = { perKind: CARD_RULES.maxPerKind, perSource: Infinity };
const ANY: Limits = { perKind: Infinity, perSource: Infinity };

/** True for a call whose opening date is still ahead of `now`. */
export function notOpenYet({ opensAt }: { opensAt: Date | null }, now: Date): boolean {
  return opensAt !== null && opensAt.getTime() > now.getTime();
}

/**
 * The matches for the cards: the open ones in rank order, then (only when
 * fewer than 5 open ones pass) calls that are not open yet, in rank order.
 */
export function pickMatches(candidates: readonly CardCandidate[], { now = new Date() }: { now?: Date } = {}): CardCandidate[] {
  const usable = candidates
    .filter((c) => c.rank !== null && c.judged && !c.rejected && c.kind !== "news" && !!c.why && !!c.nextStep)
    .sort((a, b) => a.rank! - b.rank!);
  const open = usable.filter((c) => !notOpenYet(c, now));
  const chosen: CardCandidate[] = [];
  const fits = (c: CardCandidate, { perKind, perSource }: Limits) =>
    chosen.filter((x) => x.kind === c.kind).length < perKind && chosen.filter((x) => x.source === c.source).length < perSource;
  const fill = (pool: readonly CardCandidate[], upTo: number, limits: Limits) => {
    for (const c of pool) {
      if (chosen.length >= upTo) break;
      if (!chosen.includes(c) && fits(c, limits)) chosen.push(c);
    }
  };

  // Each pass stops at its count, so a later pass only runs while there are fewer than 5.
  fill(open, CARD_RULES.max, STRICT);
  fill(open, CARD_RULES.min, ANY_SOURCE);
  fill(open, CARD_RULES.min, ANY);
  fill(usable, CARD_RULES.min, STRICT);
  fill(usable, CARD_RULES.min, ANY_SOURCE);
  fill(usable, CARD_RULES.min, ANY);
  const byRank = (a: CardCandidate, b: CardCandidate) => a.rank! - b.rank!;
  return [...chosen.filter((c) => !notOpenYet(c, now)).sort(byRank), ...chosen.filter((c) => notOpenYet(c, now)).sort(byRank)];
}

/**
 * This week's trend note for the company, if any: one whose area is one of
 * the company's tags, the earliest tag in the company's list first.
 */
export function pickTrendNote(notes: readonly TrendNoteForCard[], { weekOf, companyTags }: { weekOf: string; companyTags: readonly string[] }): TrendNoteForCard | null {
  const fitting = notes.filter((n) => n.weekOf === weekOf && companyTags.includes(n.area));
  fitting.sort((a, b) => companyTags.indexOf(a.area) - companyTags.indexOf(b.area) || a.title.localeCompare(b.title));
  return fitting[0] ?? null;
}

/** The cards in order: the picked matches, then the trend card when there is one. `now` decides which calls are open. */
export function buildCards(
  candidates: readonly CardCandidate[],
  {
    trendNotes = [],
    weekOf,
    companyTags,
    now = new Date(),
  }: { trendNotes?: readonly TrendNoteForCard[]; weekOf: string; companyTags: readonly string[]; now?: Date },
): CardDraft[] {
  const cards: CardDraft[] = pickMatches(candidates, { now }).map((m, i) => ({
    position: i + 1,
    kind: "match",
    opportunityId: m.opportunityId,
    trendNoteId: null,
    title: m.title,
    why: m.why!,
    nextStep: m.nextStep!,
    uncertainties: [...m.uncertainties],
    sources: [{ url: m.url, title: m.title }],
  }));
  const note = pickTrendNote(trendNotes, { weekOf, companyTags });
  if (note) {
    cards.push({
      position: cards.length + 1,
      kind: "trend",
      opportunityId: null,
      trendNoteId: note.id,
      title: note.title,
      why: note.body,
      nextStep: TREND_NEXT_STEP,
      uncertainties: [],
      sources: note.sources.map((s) => ({ ...s })),
    });
  }
  return cards;
}
