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

/** The matches for the cards, in rank order. */
export function pickMatches(candidates: readonly CardCandidate[]): CardCandidate[] {
  const pool = candidates
    .filter((c) => c.rank !== null && c.judged && !c.rejected && c.kind !== "news" && !!c.why && !!c.nextStep)
    .sort((a, b) => a.rank! - b.rank!);
  const chosen: CardCandidate[] = [];
  const fits = (c: CardCandidate, { perKind, perSource }: Limits) =>
    chosen.filter((x) => x.kind === c.kind).length < perKind && chosen.filter((x) => x.source === c.source).length < perSource;
  const fill = (upTo: number, limits: Limits) => {
    for (const c of pool) {
      if (chosen.length >= upTo) break;
      if (!chosen.includes(c) && fits(c, limits)) chosen.push(c);
    }
  };

  fill(CARD_RULES.max, { perKind: CARD_RULES.maxPerKind, perSource: CARD_RULES.maxPerSource });
  if (chosen.length < CARD_RULES.min) fill(CARD_RULES.min, { perKind: CARD_RULES.maxPerKind, perSource: Infinity });
  if (chosen.length < CARD_RULES.min) fill(CARD_RULES.min, { perKind: Infinity, perSource: Infinity });
  return chosen.sort((a, b) => a.rank! - b.rank!);
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

/** The cards in order: the picked matches, then the trend card when there is one. */
export function buildCards(
  candidates: readonly CardCandidate[],
  { trendNotes = [], weekOf, companyTags }: { trendNotes?: readonly TrendNoteForCard[]; weekOf: string; companyTags: readonly string[] },
): CardDraft[] {
  const cards: CardDraft[] = pickMatches(candidates).map((m, i) => ({
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
