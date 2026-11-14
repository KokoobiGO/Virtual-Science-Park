/**
 * Tag and embed opportunities and companies (A14). Jobs and scripts only: it
 * writes with getDb(), which bypasses row-level security.
 *
 * "Enriched" means the embedding is set. A row is picked up while its
 * embedding is null (or always, with `force`), and its tags and embedding are
 * written together, so a row the tagger gave no tags is not tagged again on
 * every run. Fixture opportunities (externalId "fixture-...") are never touched.
 *
 * - Opportunities: tags (only while the row has none, or with `force` for
 *   sources that are not hand-curated) and `embedding`.
 * - Companies: `tags` and `publicEmbedding` from the public profile text only,
 *   and `company_private.personalEmbedding` from the personal text.
 *
 * Each call takes at most ENRICH_CHUNK ids, so one tagger call and one Voyage
 * call do the work and a job step stays well under Netlify's 30 s.
 */
import { and, asc, eq, inArray, isNull, notLike, or } from "drizzle-orm";
import { getDb } from "../db";
import { claims, companies, companyPrivate, opportunities } from "../db/schema";
import { OpportunityTag } from "../schemas";
import { emptyTaggerUsage, tagTexts, type TaggerUsage } from "../tagger";
import { voyageEmbed } from "../voyage";
import { opportunityText, personalProfileText, publicProfileText } from "./text";

/** Ids per call: one tagger batch, one Voyage request. */
export const ENRICH_CHUNK = 10;

/** Sources whose tags were set by hand. The tagger never replaces them, not even with `force`. */
export const CURATED_TAG_SOURCES: readonly string[] = ["Curated testbed list"];

const FIXTURE_PATTERN = "fixture-%";

export type EnrichOptions = {
  /** Opportunities: tag again rows that already have tags, except hand-curated ones. Companies are always tagged. */
  force?: boolean;
  /** Called with the texts right before the Voyage request, e.g. to wait for the rate limit. */
  beforeEmbed?: (texts: string[]) => Promise<void>;
};

export type EnrichResult = {
  /** Rows that got a new embedding. */
  enriched: number;
  /** Rows the tagger tagged. */
  tagged: number;
  /** Of the tagged rows, how many got no tag. */
  zeroTags: number;
  tagCounts: Record<OpportunityTag, number>;
  /** Texts sent to Voyage and their characters. */
  embedded: { texts: number; chars: number };
  tagger: TaggerUsage;
};

const emptyTagCounts = () => Object.fromEntries(OpportunityTag.options.map((t) => [t, 0])) as Record<OpportunityTag, number>;

export function emptyEnrichResult(): EnrichResult {
  return { enriched: 0, tagged: 0, zeroTags: 0, tagCounts: emptyTagCounts(), embedded: { texts: 0, chars: 0 }, tagger: emptyTaggerUsage() };
}

function countTags(result: EnrichResult, tags: Map<string, OpportunityTag[]>) {
  result.tagged += tags.size;
  for (const list of tags.values()) {
    if (!list.length) result.zeroTags++;
    for (const tag of list) result.tagCounts[tag]++;
  }
}

function checkChunk(ids: string[]) {
  if (ids.length > ENRICH_CHUNK) throw new Error(`At most ${ENRICH_CHUNK} ids per call, got ${ids.length}.`);
}

/**
 * One vector per text, in order. Equal texts are sent once (a personal text
 * is often the same as the public one).
 */
async function embedDocuments(texts: string[], result: EnrichResult, beforeEmbed?: EnrichOptions["beforeEmbed"]): Promise<number[][]> {
  const unique = [...new Set(texts)];
  await beforeEmbed?.(unique);
  const vectors = await voyageEmbed(unique, { inputType: "document" });
  result.embedded.texts += unique.length;
  result.embedded.chars += unique.reduce((sum, t) => sum + t.length, 0);
  const byText = new Map(unique.map((text, i) => [text, vectors[i]]));
  return texts.map((text) => byText.get(text)!);
}

export type PendingWork = { opportunityIds: string[]; companyIds: string[] };

/**
 * Ids to enrich: rows without an embedding, or every row with `force`. A
 * company is pending while either of its two embeddings is missing. `limit`
 * caps each list, for a test.
 */
export async function listPending({ force = false, limit }: { force?: boolean; limit?: number } = {}): Promise<PendingWork> {
  const db = getDb();
  const opportunityQuery = db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(and(notLike(opportunities.externalId, FIXTURE_PATTERN), force ? undefined : isNull(opportunities.embedding)))
    .orderBy(asc(opportunities.source), asc(opportunities.externalId));
  const companyQuery = db
    .select({ id: companies.id })
    .from(companies)
    .leftJoin(companyPrivate, eq(companyPrivate.companyId, companies.id))
    .where(force ? undefined : or(isNull(companies.publicEmbedding), isNull(companyPrivate.personalEmbedding)))
    .orderBy(asc(companies.slug));
  const [opportunityRows, companyRows] = await Promise.all([
    limit ? opportunityQuery.limit(limit) : opportunityQuery,
    limit ? companyQuery.limit(limit) : companyQuery,
  ]);
  return { opportunityIds: opportunityRows.map((r) => r.id), companyIds: companyRows.map((r) => r.id) };
}

export type OpportunityToEnrich = { id: string; source: string; title: string; text: string; tags: string[]; needsTags: boolean };

/** The opportunities behind these ids with their embedding text, fixtures left out. */
export async function loadOpportunities(ids: string[], { force = false }: { force?: boolean } = {}): Promise<OpportunityToEnrich[]> {
  if (!ids.length) return [];
  const rows = await getDb()
    .select({ id: opportunities.id, source: opportunities.source, title: opportunities.title, description: opportunities.description, tags: opportunities.tags })
    .from(opportunities)
    .where(and(inArray(opportunities.id, ids), notLike(opportunities.externalId, FIXTURE_PATTERN)));
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    title: row.title,
    text: opportunityText(row),
    tags: row.tags,
    needsTags: row.tags.length === 0 || (force && !CURATED_TAG_SOURCES.includes(row.source)),
  }));
}

/** Tag (where needed) and embed up to ENRICH_CHUNK opportunities. Fixture rows among the ids are skipped. */
export async function enrichOpportunities(ids: string[], options: EnrichOptions = {}): Promise<EnrichResult> {
  checkChunk(ids);
  const result = emptyEnrichResult();
  const rows = await loadOpportunities(ids, options);
  if (!rows.length) return result;

  const tags = await tagTexts(
    rows.filter((row) => row.needsTags).map((row) => ({ id: row.id, text: row.text })),
    { usage: result.tagger },
  );
  countTags(result, tags);
  const vectors = await embedDocuments(
    rows.map((row) => row.text),
    result,
    options.beforeEmbed,
  );

  await getDb().transaction(async (tx) => {
    for (const [i, row] of rows.entries()) {
      const newTags = tags.get(row.id);
      await tx
        .update(opportunities)
        .set({ embedding: vectors[i], ...(newTags ? { tags: newTags } : {}) })
        .where(eq(opportunities.id, row.id));
    }
  });
  result.enriched = rows.length;
  return result;
}

export type CompanyToEnrich = { id: string; name: string; publicText: string; personalText: string };

/** The companies behind these ids with their public and personal texts, from active claims. */
export async function loadCompanies(ids: string[]): Promise<CompanyToEnrich[]> {
  if (!ids.length) return [];
  const db = getDb();
  const [rows, claimRows, privateRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name, industry: companies.industry, bspDescription: companies.bspDescription })
      .from(companies)
      .where(inArray(companies.id, ids)),
    db
      .select({
        companyId: claims.companyId,
        field: claims.field,
        value: claims.value,
        status: claims.status,
        visibility: claims.visibility,
        reviewState: claims.reviewState,
        updatedBy: claims.updatedBy,
        updatedAt: claims.updatedAt,
      })
      .from(claims)
      .where(and(inArray(claims.companyId, ids), eq(claims.reviewState, "active"))),
    db.select({ companyId: companyPrivate.companyId, userPriorities: companyPrivate.userPriorities }).from(companyPrivate).where(inArray(companyPrivate.companyId, ids)),
  ]);
  return rows.map((company) => {
    const own = claimRows.filter((c) => c.companyId === company.id);
    const priorities = privateRows.find((p) => p.companyId === company.id)?.userPriorities ?? [];
    return {
      id: company.id,
      name: company.name,
      publicText: publicProfileText(company, own),
      personalText: personalProfileText(company, own, priorities),
    };
  });
}

/**
 * Tag and embed up to ENRICH_CHUNK companies: tags and the public embedding
 * from public claims only, the personal embedding from all active claims and
 * the member's priorities. Creates the company_private row if there is none.
 */
export async function enrichCompanies(ids: string[], options: EnrichOptions = {}): Promise<EnrichResult> {
  checkChunk(ids);
  const result = emptyEnrichResult();
  const texts = await loadCompanies(ids);
  if (!texts.length) return result;

  // Company tags are public, so the tagger only ever sees the public text.
  const tags = await tagTexts(
    texts.map((t) => ({ id: t.id, text: t.publicText })),
    { usage: result.tagger },
  );
  countTags(result, tags);
  const vectors = await embedDocuments(
    texts.flatMap((t) => [t.publicText, t.personalText]),
    result,
    options.beforeEmbed,
  );

  await getDb().transaction(async (tx) => {
    for (const [i, t] of texts.entries()) {
      await tx
        .update(companies)
        .set({ tags: tags.get(t.id)!, publicEmbedding: vectors[2 * i] })
        .where(eq(companies.id, t.id));
      await tx
        .insert(companyPrivate)
        .values({ companyId: t.id, personalEmbedding: vectors[2 * i + 1] })
        .onConflictDoUpdate({ target: companyPrivate.companyId, set: { personalEmbedding: vectors[2 * i + 1], updatedAt: new Date() } });
    }
  });
  result.enriched = texts.length;
  return result;
}

/** Adds one call's result into a running total. */
export function addResults(total: EnrichResult, part: EnrichResult): EnrichResult {
  total.enriched += part.enriched;
  total.tagged += part.tagged;
  total.zeroTags += part.zeroTags;
  for (const tag of OpportunityTag.options) total.tagCounts[tag] += part.tagCounts[tag];
  total.embedded.texts += part.embedded.texts;
  total.embedded.chars += part.embedded.chars;
  total.tagger.calls += part.tagger.calls;
  total.tagger.inputTokens += part.tagger.inputTokens;
  total.tagger.outputTokens += part.tagger.outputTokens;
  return total;
}

