/**
 * Candidate pairs for the connection finder (A28). Three sources, each capped,
 * so one run stays at about 110 model calls at most:
 *
 * - similar: each member's nearest other members by public embedding. These
 *   are mostly the same kind of company (two IT consultancies), so most fail
 *   the judge, but a supplier and its customer in one field are found here too.
 * - role: members that share a tag (A14) but differ in role: a maker and a
 *   user of what makers make (a public agency, the armed forces, a ferry or
 *   grid operator), by the industry on BSP's member page.
 * - opportunity: members whose kept public matches include the same open
 *   funding call, test facility or event. A call or facility kept for many
 *   members says little about any pair, so it counts for less.
 *
 * Two members of the same kind by that industry (two public agencies, two
 * consultancies, two operators) are not judged at all: the judge says no to
 * them anyway. Everything here is public: public embeddings, tags from public
 * claims, BSP's member page and the public-mode matches.
 *
 * The order is fixed (the most sources first, then similarity, then ids), so
 * two runs on the same data judge the same pairs in the same order.
 */
import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { companies } from "../db/schema";
import { MAX_SHOWN_OPPORTUNITIES, type SharedOpportunity } from "./prompt";

/** Nearest other companies looked at per company. */
export const NEIGHBOURS_PER_COMPANY = 3;

/** Pairs judged per run from each source, the best first, and in all. */
export const MAX_SIMILAR = 35;
export const MAX_ROLE = 35;
export const MAX_OPPORTUNITY = 40;
export const MAX_CANDIDATES = 110;

/** Role pairs one company may be part of, the most similar first, so one big agency does not take every slot. */
export const ROLE_PAIRS_PER_COMPANY = 6;

/** An opportunity kept for more members than this says nothing about any pair of them. */
export const MAX_SHARED_BY = 6;

/** How much one shared opportunity says, by kind: the same test need weighs most, a course or meetup least. */
const KIND_WEIGHT: Record<string, number> = { testbed: 1.5, funding: 1, event: 0.5 };

export type CandidateReason = "similar" | "role" | "opportunity";
const REASON_ORDER: CandidateReason[] = ["similar", "role", "opportunity"];

/** One company's neighbour, as the similarity query returns it. */
export type Neighbour = { companyId: string; neighbourId: string; similarity: number };

/** A pair, stored once: `companyAId` < `companyBId`. */
export type Candidate = { companyAId: string; companyBId: string; similarity: number };

export type CandidatePair = Candidate & {
  companyAName: string;
  companyBName: string;
  /** Why the pair is judged, in source order. */
  reasons: CandidateReason[];
  /** Open opportunities kept for both, the most telling first; at most MAX_SHOWN_OPPORTUNITIES. */
  sharedOpportunities: SharedOpportunity[];
};

/** A member as the candidate rules need it. */
export type Member = { id: string; name: string; industry: string | null; tags: string[] };

/**
 * A member's role, from the industry on BSP's member page (in Swedish).
 * public: a public agency or authority; operator: runs ferries or
 * infrastructure; consultancy: sells advice and consulting; maker: the rest.
 * Public agencies and operators are the users and buyers of what makers make.
 */
export type MemberRole = "public" | "operator" | "consultancy" | "maker";

export function memberRole(industry: string | null): MemberRole {
  const text = (industry ?? "").toLowerCase();
  if (/offentlig verksamhet/.test(text)) return "public";
  if (/rederi|infrastruktur/.test(text)) return "operator";
  if (/konsultverksamhet|rådgivning/.test(text)) return "consultancy";
  return "maker";
}

const isUser = (role: MemberRole) => role === "public" || role === "operator";

/** Two members of the same kind: the judge would say no, so they are not judged. */
export function sameKind(a: MemberRole, b: MemberRole): boolean {
  return (isUser(a) && isUser(b)) || (a === "consultancy" && b === "consultancy");
}

const ordered = (x: string, y: string): [string, string] => {
  const [a, b] = [x.toLowerCase(), y.toLowerCase()].sort();
  return [a, b];
};
const pairKey = (x: string, y: string) => ordered(x, y).join("|");

/** Highest first, then by ids, so ties never wobble between runs. */
const byScoreThenIds = <T extends Candidate>(score: (c: T) => number) => (x: T, y: T) =>
  score(y) - score(x) || (x.companyAId + x.companyBId < y.companyAId + y.companyBId ? -1 : x.companyAId + x.companyBId > y.companyAId + y.companyBId ? 1 : 0);

/**
 * Pairs from neighbour lists: at most `perCompany` neighbours per company,
 * each pair once with the smaller id first, the `max` most similar. Pure, so
 * the pairing can be tested without a database.
 */
export function pairCandidates(
  neighbours: readonly Neighbour[],
  { perCompany = NEIGHBOURS_PER_COMPANY, max = MAX_SIMILAR }: { perCompany?: number; max?: number } = {},
): Candidate[] {
  const byCompany = new Map<string, Neighbour[]>();
  for (const n of neighbours) {
    if (n.companyId === n.neighbourId) continue;
    byCompany.set(n.companyId, [...(byCompany.get(n.companyId) ?? []), n]);
  }

  const pairs = new Map<string, Candidate>();
  for (const list of byCompany.values()) {
    const nearest = [...list].sort((a, b) => b.similarity - a.similarity || (a.neighbourId < b.neighbourId ? -1 : 1)).slice(0, perCompany);
    for (const n of nearest) {
      const [a, b] = ordered(n.companyId, n.neighbourId);
      const key = `${a}|${b}`;
      const seen = pairs.get(key);
      if (!seen || n.similarity > seen.similarity) pairs.set(key, { companyAId: a, companyBId: b, similarity: n.similarity });
    }
  }

  return [...pairs.values()].sort(byScoreThenIds((c) => c.similarity)).slice(0, max);
}

/**
 * Pairs of a maker and a user (a public agency or an operator) that share at
 * least one tag, the most similar first, at most `perCompany` per member and
 * `max` in all.
 */
export function roleCandidates(
  members: readonly Member[],
  similarity: (a: string, b: string) => number,
  { perCompany = ROLE_PAIRS_PER_COMPANY, max = MAX_ROLE }: { perCompany?: number; max?: number } = {},
): Candidate[] {
  const all: Candidate[] = [];
  for (const user of members.filter((m) => isUser(memberRole(m.industry)))) {
    for (const maker of members.filter((m) => memberRole(m.industry) === "maker")) {
      if (!user.tags.some((tag) => maker.tags.includes(tag))) continue;
      const [a, b] = ordered(user.id, maker.id);
      all.push({ companyAId: a, companyBId: b, similarity: similarity(a, b) });
    }
  }
  const used = new Map<string, number>();
  const chosen: Candidate[] = [];
  for (const c of all.sort(byScoreThenIds((p) => p.similarity))) {
    if ((used.get(c.companyAId) ?? 0) >= perCompany || (used.get(c.companyBId) ?? 0) >= perCompany) continue;
    chosen.push(c);
    used.set(c.companyAId, (used.get(c.companyAId) ?? 0) + 1);
    used.set(c.companyBId, (used.get(c.companyBId) ?? 0) + 1);
    if (chosen.length >= max) break;
  }
  return chosen;
}

/** A kept public match, with the opportunity fields the prompt shows. */
export type KeptMatch = { companyId: string; opportunity: SharedOpportunity };

/** What one shared opportunity says about a pair: its kind's weight, less when many members have it. */
function opportunityWeight(opportunity: SharedOpportunity, keptBy: number): number {
  return (KIND_WEIGHT[opportunity.kind] ?? 0) / Math.max(1, keptBy - 1);
}

/** Per pair key, the opportunities kept for both, the most telling first. Opportunities kept for more than MAX_SHARED_BY members are left out. */
export function sharedOpportunitiesByPair(kept: readonly KeptMatch[], maxSharedBy = MAX_SHARED_BY): Map<string, { score: number; opportunities: SharedOpportunity[] }> {
  const byOpportunity = new Map<string, { opportunity: SharedOpportunity; companies: Set<string> }>();
  for (const k of kept) {
    if (!KIND_WEIGHT[k.opportunity.kind]) continue;
    const entry = byOpportunity.get(k.opportunity.id) ?? { opportunity: k.opportunity, companies: new Set<string>() };
    entry.companies.add(k.companyId.toLowerCase());
    byOpportunity.set(k.opportunity.id, entry);
  }

  const byPair = new Map<string, { opportunity: SharedOpportunity; weight: number }[]>();
  for (const { opportunity, companies: ids } of byOpportunity.values()) {
    if (ids.size < 2 || ids.size > maxSharedBy) continue;
    const list = [...ids].sort();
    const weight = opportunityWeight(opportunity, ids.size);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = `${list[i]}|${list[j]}`;
        byPair.set(key, [...(byPair.get(key) ?? []), { opportunity, weight }]);
      }
    }
  }

  const result = new Map<string, { score: number; opportunities: SharedOpportunity[] }>();
  for (const [key, list] of byPair) {
    list.sort((x, y) => y.weight - x.weight || x.opportunity.title.localeCompare(y.opportunity.title) || (x.opportunity.id < y.opportunity.id ? -1 : 1));
    result.set(key, { score: list.reduce((sum, o) => sum + o.weight, 0), opportunities: list.map((o) => o.opportunity) });
  }
  return result;
}

/** Pairs with the most telling shared opportunities, at most `max`. */
export function opportunityCandidates(
  shared: ReadonlyMap<string, { score: number }>,
  similarity: (a: string, b: string) => number,
  { max = MAX_OPPORTUNITY }: { max?: number } = {},
): Candidate[] {
  const scored = [...shared].map(([key, { score }]) => {
    const [a, b] = key.split("|");
    return { candidate: { companyAId: a, companyBId: b, similarity: similarity(a, b) }, score };
  });
  scored.sort((x, y) => y.score - x.score || byScoreThenIds<Candidate>((c) => c.similarity)(x.candidate, y.candidate));
  return scored.slice(0, max).map((s) => s.candidate);
}

export type CandidateSources = Record<CandidateReason, Candidate[]>;

/**
 * One list from the three sources: each pair once with all its reasons, pairs
 * of the same kind left out, the pairs with the most reasons first, then the
 * most similar. Pure.
 */
export function mergeCandidates(
  sources: CandidateSources,
  roleOf: (id: string) => MemberRole,
  { max = MAX_CANDIDATES }: { max?: number } = {},
): (Candidate & { reasons: CandidateReason[] })[] {
  const merged = new Map<string, Candidate & { reasons: CandidateReason[] }>();
  for (const reason of REASON_ORDER) {
    for (const c of sources[reason]) {
      if (sameKind(roleOf(c.companyAId), roleOf(c.companyBId))) continue;
      const key = pairKey(c.companyAId, c.companyBId);
      const seen = merged.get(key);
      if (seen) {
        if (!seen.reasons.includes(reason)) seen.reasons.push(reason);
      } else {
        merged.set(key, { ...c, reasons: [reason] });
      }
    }
  }
  return [...merged.values()]
    .sort((x, y) => y.reasons.length - x.reasons.length || byScoreThenIds<Candidate>((c) => c.similarity)(x, y))
    .slice(0, max);
}

/**
 * The run's candidate pairs with both names and their shared opportunities.
 * `limit` judges only the first few, for a test.
 */
export async function listCandidates({ limit, now = new Date() }: { limit?: number; now?: Date } = {}): Promise<CandidatePair[]> {
  const db = getDb();
  const members = (
    await db.execute<{ id: string; name: string; industry: string | null; tags: string[] | null }>(sql`
      select id, name, industry, tags from ${companies}
      where public_embedding is not null and profile_status = 'profiled'
      order by id`)
  ).map((m) => ({ id: m.id.toLowerCase(), name: m.name, industry: m.industry, tags: m.tags ?? [] }));
  if (members.length < 2) return [];

  const similarities = await db.execute<{ a: string; b: string; similarity: number }>(sql`
    select a.id as a, b.id as b, 1 - (a.public_embedding <=> b.public_embedding) as similarity
    from ${companies} a join ${companies} b on a.id < b.id
    where a.public_embedding is not null and a.profile_status = 'profiled'
      and b.public_embedding is not null and b.profile_status = 'profiled'`);
  const simByPair = new Map(similarities.map((r) => [pairKey(r.a, r.b), Number(r.similarity)]));
  const similarity = (a: string, b: string) => simByPair.get(pairKey(a, b)) ?? 0;

  // Kept public matches on open opportunities: judged, not rejected, still ranked. No news, no hand-entered rows.
  const kept = await db.execute<{
    company_id: string;
    id: string;
    kind: string;
    source: string;
    title: string;
    deadline: string | null;
    event_date: string | null;
  }>(sql`
    select m.company_id, o.id, o.kind, o.source, o.title,
      to_char(o.deadline at time zone 'Europe/Stockholm', 'YYYY-MM-DD') as deadline,
      to_char(o.event_date at time zone 'Europe/Stockholm', 'YYYY-MM-DD') as event_date
    from matches m join opportunities o on o.id = m.opportunity_id
    where m.mode = 'public' and m.rank is not null and m.rejected = false and m.judged_at is not null
      and o.kind <> 'news' and o.simulated = false
      and (o.deadline is null or o.deadline >= ${now.toISOString()})
      and (o.event_date is null or o.event_date >= ${now.toISOString()})`);
  const memberIds = new Set(members.map((m) => m.id));
  const shared = sharedOpportunitiesByPair(
    kept
      .filter((k) => memberIds.has(k.company_id.toLowerCase()))
      .map((k) => ({
        companyId: k.company_id,
        opportunity: { id: k.id, kind: k.kind, source: k.source, title: k.title, deadline: k.deadline, eventDate: k.event_date },
      })),
  );

  const neighbours = similarities.flatMap((r) => [
    { companyId: r.a, neighbourId: r.b, similarity: Number(r.similarity) },
    { companyId: r.b, neighbourId: r.a, similarity: Number(r.similarity) },
  ]);
  const roles = new Map(members.map((m) => [m.id, memberRole(m.industry)]));
  const merged = mergeCandidates(
    {
      similar: pairCandidates(neighbours),
      role: roleCandidates(members, similarity),
      opportunity: opportunityCandidates(shared, similarity),
    },
    (id) => roles.get(id.toLowerCase()) ?? "maker",
  );
  const chosen = limit ? merged.slice(0, limit) : merged;
  if (!chosen.length) return [];

  const ids = [...new Set(chosen.flatMap((p) => [p.companyAId, p.companyBId]))];
  const names = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids))).map((c) => [c.id.toLowerCase(), c.name]));
  return chosen.map((p) => ({
    ...p,
    companyAName: names.get(p.companyAId) ?? p.companyAId,
    companyBName: names.get(p.companyBId) ?? p.companyBId,
    sharedOpportunities: (shared.get(pairKey(p.companyAId, p.companyBId))?.opportunities ?? []).slice(0, MAX_SHOWN_OPPORTUNITIES),
  }));
}
