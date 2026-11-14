/**
 * Compare two members (C9), for BSP staff: each member's top five from the
 * public ranking, side by side, with the opportunities that are in both.
 * Pure, so the rules are unit-tested; the reads are in query.ts.
 */
import { FIXTURE_PREFIX } from "../matcher/score";
import type { OpportunityKind } from "../schemas";

export const COMPARE_TOP_N = 5;

/** Member slugs as the member import writes them. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

/** A public match row with its opportunity, as stored. */
export type PublicMatchRow = {
  opportunityId: string;
  externalId: string;
  rank: number | null;
  rejected: boolean;
  why: string | null;
  title: string;
  kind: OpportunityKind;
  source: string;
  url: string;
  simulated: boolean;
};

export type CompareItem = {
  /** 1 to 5: the place among the member's kept matches. */
  position: number;
  /** The stored rank. Rejected rows keep theirs, so ranks can have gaps. */
  rank: number;
  opportunityId: string;
  title: string;
  kind: OpportunityKind;
  source: string;
  url: string;
  simulated: boolean;
  /** The judge's why; null when the match is not judged yet. */
  why: string | null;
  /** True when the other member's top five has it too. */
  inBoth: boolean;
};

/**
 * The top `n` kept matches by rank. A rejected row, a row without a rank and an
 * old test fixture are never in it.
 */
export function topMatches(rows: readonly PublicMatchRow[], n = COMPARE_TOP_N): Omit<CompareItem, "inBoth">[] {
  return rows
    .filter((r) => r.rank !== null && !r.rejected && !r.externalId.startsWith(FIXTURE_PREFIX))
    .sort((a, b) => a.rank! - b.rank!)
    .slice(0, n)
    .map((r, i) => ({
      position: i + 1,
      rank: r.rank!,
      opportunityId: r.opportunityId,
      title: r.title,
      kind: r.kind,
      source: r.source,
      url: r.url,
      simulated: r.simulated,
      why: r.why?.trim() || null,
    }));
}

/** Marks the opportunities that appear in both lists; `shared` keeps A's order. */
export function markShared(
  a: readonly Omit<CompareItem, "inBoth">[],
  b: readonly Omit<CompareItem, "inBoth">[],
): { a: CompareItem[]; b: CompareItem[]; shared: string[] } {
  const idsA = new Set(a.map((x) => x.opportunityId));
  const idsB = new Set(b.map((x) => x.opportunityId));
  return {
    a: a.map((x) => ({ ...x, inBoth: idsB.has(x.opportunityId) })),
    b: b.map((x) => ({ ...x, inBoth: idsA.has(x.opportunityId) })),
    shared: a.filter((x) => idsB.has(x.opportunityId)).map((x) => x.opportunityId),
  };
}

export type SlugPair = { ok: true; a: string; b: string } | { ok: false; error: string };

/** The two members to compare, from `?a=...&b=...`. */
export function parseSlugPair(a: string | null | undefined, b: string | null | undefined): SlugPair {
  const slugA = (a ?? "").trim().toLowerCase();
  const slugB = (b ?? "").trim().toLowerCase();
  if (!slugA || !slugB) return { ok: false, error: "Pick two members." };
  if (!SLUG_PATTERN.test(slugA) || !SLUG_PATTERN.test(slugB)) return { ok: false, error: "That is not a member slug." };
  if (slugA === slugB) return { ok: false, error: "Pick two different members." };
  return { ok: true, a: slugA, b: slugB };
}
