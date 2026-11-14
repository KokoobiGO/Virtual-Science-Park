/**
 * Candidate pairs for the connection finder (A28): for each profiled member
 * with a public embedding, its nearest other such members by cosine
 * similarity. Each pair is kept once, with the smaller id as A (the order the
 * connections table asks for), and only the most similar pairs are judged.
 *
 * The nearest neighbours of a company are mostly companies of the same kind,
 * so most candidates are expected to fail the judge: similarity only decides
 * which pairs are worth a model call.
 */
import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { companies } from "../db/schema";

/** Nearest other companies looked at per company. */
export const NEIGHBOURS_PER_COMPANY = 4;

/** Pairs judged per run, the most similar first. */
export const MAX_CANDIDATES = 60;

/** One company's neighbour, as the similarity query returns it. */
export type Neighbour = { companyId: string; neighbourId: string; similarity: number };

/** A pair, stored once: `companyAId` < `companyBId`. */
export type Candidate = { companyAId: string; companyBId: string; similarity: number };

export type CandidatePair = Candidate & { companyAName: string; companyBName: string };

/**
 * Pairs from neighbour lists: at most `perCompany` neighbours per company,
 * each pair once with the smaller id first, the `max` most similar. Pure, so
 * the pairing can be tested without a database.
 */
export function pairCandidates(
  neighbours: readonly Neighbour[],
  { perCompany = NEIGHBOURS_PER_COMPANY, max = MAX_CANDIDATES }: { perCompany?: number; max?: number } = {},
): Candidate[] {
  const byCompany = new Map<string, Neighbour[]>();
  for (const n of neighbours) {
    if (n.companyId === n.neighbourId) continue;
    byCompany.set(n.companyId, [...(byCompany.get(n.companyId) ?? []), n]);
  }

  const pairs = new Map<string, Candidate>();
  for (const list of byCompany.values()) {
    for (const n of [...list].sort((a, b) => b.similarity - a.similarity).slice(0, perCompany)) {
      const [a, b] = [n.companyId.toLowerCase(), n.neighbourId.toLowerCase()].sort();
      const key = `${a}|${b}`;
      const seen = pairs.get(key);
      if (!seen || n.similarity > seen.similarity) pairs.set(key, { companyAId: a, companyBId: b, similarity: n.similarity });
    }
  }

  return [...pairs.values()]
    .sort((x, y) => y.similarity - x.similarity || (x.companyAId + x.companyBId < y.companyAId + y.companyBId ? -1 : 1))
    .slice(0, max);
}

/** The run's candidate pairs with both names, the most similar first. `limit` judges only the first few, for a test. */
export async function listCandidates({ limit }: { limit?: number } = {}): Promise<CandidatePair[]> {
  const db = getDb();
  const rows = await db.execute<{ company_id: string; neighbour_id: string; similarity: number }>(sql`
    select c.id as company_id, n.id as neighbour_id, 1 - (c.public_embedding <=> n.public_embedding) as similarity
    from ${companies} c
    cross join lateral (
      select o.id, o.public_embedding
      from ${companies} o
      where o.id <> c.id and o.public_embedding is not null and o.profile_status = 'profiled'
      order by o.public_embedding <=> c.public_embedding
      limit ${NEIGHBOURS_PER_COMPANY}
    ) n
    where c.public_embedding is not null and c.profile_status = 'profiled'
  `);

  const pairs = pairCandidates(rows.map((r) => ({ companyId: r.company_id, neighbourId: r.neighbour_id, similarity: Number(r.similarity) })));
  const chosen = limit ? pairs.slice(0, limit) : pairs;
  if (!chosen.length) return [];

  const ids = [...new Set(chosen.flatMap((p) => [p.companyAId, p.companyBId]))];
  const names = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids))).map((c) => [c.id, c.name]));
  return chosen.map((p) => ({ ...p, companyAName: names.get(p.companyAId) ?? p.companyAId, companyBName: names.get(p.companyBId) ?? p.companyBId }));
}
