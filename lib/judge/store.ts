/**
 * What the judge reads and writes (A16). Jobs and scripts only: getDb()
 * bypasses row-level security.
 *
 * It writes only the judge's columns of existing match rows (`why`,
 * `nextStep`, `uncertainties`, `rejected`, `rejectionReason`, `judgedAt`),
 * by row id. It never inserts a match and never writes `eligibility`, which
 * stays "potential_match".
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { claims, companies, companyPrivate, matches, opportunities } from "../db/schema";
import { cutText } from "../embeddings/text";
import { loadCompanies } from "../embeddings/enrich";
import { UnknownCompanyError } from "../matcher/store";
import type { MatchMode, OpportunityKind } from "../schemas";
import { hasPrivateData } from "./personal";
import { MAX_JUDGE_DESCRIPTION_CHARS } from "./prompt";
import type { Judgement } from "./verify";

/** One ranked match to judge, with what the prompt shows of its opportunity. Dates are ISO strings: job steps pass JSON. */
export type JudgeRow = {
  matchId: string;
  opportunityId: string;
  mode: MatchMode;
  rank: number;
  title: string;
  kind: OpportunityKind;
  source: string;
  url: string;
  deadline: string | null;
  eventDate: string | null;
  tags: string[];
  /** Tags the opportunity shares with the company, as the matcher stored them. */
  matchedOn: string[];
  contact: string | null;
  eligibilityText: string | null;
  description: string | null;
};

export type JudgeWork = {
  company: { id: string; slug: string; name: string };
  publicText: string;
  personalText: string;
  privateData: boolean;
  public: JudgeRow[];
  personal: JudgeRow[];
  /** Public judgements already stored for this company, for the personal copy rule. */
  storedPublic: { opportunityId: string; judgement: Judgement }[];
};

export { UnknownCompanyError };

/** The prompt cuts again with a "[cut]" mark; this only keeps the step state small. */
const STORED_DESCRIPTION_CHARS = MAX_JUDGE_DESCRIPTION_CHARS + 200;

const judgementOf = (row: {
  rejected: boolean;
  why: string | null;
  nextStep: string | null;
  uncertainties: string[];
  rejectionReason: string | null;
}): Judgement => ({ rejected: row.rejected, why: row.why, nextStep: row.nextStep, uncertainties: row.uncertainties, rejectionReason: row.rejectionReason });

/**
 * The company's ranked rows to judge in both modes: those without `judgedAt`,
 * or every ranked row with `force`. In rank order.
 */
export async function loadJudgeWork(slug: string, { force = false }: { force?: boolean } = {}): Promise<JudgeWork> {
  const db = getDb();
  const [company] = await db.select({ id: companies.id, slug: companies.slug, name: companies.name }).from(companies).where(eq(companies.slug, slug));
  if (!company) throw new UnknownCompanyError(`No company with slug "${slug}".`);

  const [[texts], [privateClaims], [privateRow], rows, judgedPublic] = await Promise.all([
    loadCompanies([company.id]),
    db
      .select({ n: count() })
      .from(claims)
      .where(and(eq(claims.companyId, company.id), eq(claims.reviewState, "active"), eq(claims.visibility, "private"))),
    db.select({ userPriorities: companyPrivate.userPriorities }).from(companyPrivate).where(eq(companyPrivate.companyId, company.id)),
    db
      .select({
        matchId: matches.id,
        opportunityId: matches.opportunityId,
        mode: matches.mode,
        rank: matches.rank,
        title: opportunities.title,
        kind: opportunities.kind,
        source: opportunities.source,
        url: opportunities.url,
        deadline: opportunities.deadline,
        eventDate: opportunities.eventDate,
        tags: opportunities.tags,
        matchedOn: matches.matchedOn,
        contact: opportunities.contact,
        eligibilityText: opportunities.eligibilityText,
        description: opportunities.description,
      })
      .from(matches)
      .innerJoin(opportunities, eq(opportunities.id, matches.opportunityId))
      .where(and(eq(matches.companyId, company.id), isNotNull(matches.rank), force ? undefined : isNull(matches.judgedAt)))
      .orderBy(asc(matches.mode), asc(matches.rank)),
    db
      .select({
        opportunityId: matches.opportunityId,
        rejected: matches.rejected,
        why: matches.why,
        nextStep: matches.nextStep,
        uncertainties: matches.uncertainties,
        rejectionReason: matches.rejectionReason,
      })
      .from(matches)
      .where(and(eq(matches.companyId, company.id), eq(matches.mode, "public"), isNotNull(matches.judgedAt))),
  ]);

  const toRow = (r: (typeof rows)[number]): JudgeRow => ({
    ...r,
    rank: r.rank!,
    deadline: r.deadline?.toISOString() ?? null,
    eventDate: r.eventDate?.toISOString() ?? null,
    description: r.description ? cutText(r.description.replace(/\s+/g, " ").trim(), STORED_DESCRIPTION_CHARS) : null,
  });

  return {
    company,
    publicText: texts.publicText,
    personalText: texts.personalText,
    privateData: hasPrivateData({ privateActiveClaims: privateClaims?.n ?? 0, priorities: privateRow?.userPriorities ?? [] }),
    public: rows.filter((r) => r.mode === "public").map(toRow),
    personal: rows.filter((r) => r.mode === "personal").map(toRow),
    storedPublic: judgedPublic.map((r) => ({ opportunityId: r.opportunityId, judgement: judgementOf(r) })),
  };
}

/** Writes the judge's columns of these match rows, in one transaction. Returns the rows written. */
export async function storeJudgements(entries: readonly { matchId: string; judgement: Judgement }[], judgedAt = new Date()): Promise<number> {
  if (!entries.length) return 0;
  return getDb().transaction(async (tx) => {
    let written = 0;
    for (const { matchId, judgement } of entries) {
      const rows = await tx
        .update(matches)
        .set({
          why: judgement.rejected ? null : judgement.why,
          nextStep: judgement.rejected ? null : judgement.nextStep,
          uncertainties: judgement.rejected ? [] : judgement.uncertainties,
          rejected: judgement.rejected,
          rejectionReason: judgement.rejected ? judgement.rejectionReason : null,
          judgedAt,
        })
        .where(eq(matches.id, matchId))
        .returning({ id: matches.id });
      written += rows.length;
    }
    return written;
  });
}

export type CompanyToJudge = { id: string; slug: string; name: string; pending: number };

/**
 * Companies with ranked rows to judge (no `judgedAt`, or any ranked row with
 * `force`), by slug, with how many rows. With `slugs`, only those; an unknown
 * slug throws UnknownCompanyError.
 */
export async function companiesToJudge({ slugs, force = false }: { slugs?: readonly string[]; force?: boolean } = {}): Promise<CompanyToJudge[]> {
  const db = getDb();
  if (slugs?.length) {
    const known = await db.select({ slug: companies.slug }).from(companies).where(inArray(companies.slug, [...slugs]));
    const unknown = slugs.filter((slug) => !known.some((k) => k.slug === slug));
    if (unknown.length) throw new UnknownCompanyError(`No company with slug: ${unknown.join(", ")}.`);
  }
  return db
    .select({ id: companies.id, slug: companies.slug, name: companies.name, pending: count() })
    .from(matches)
    .innerJoin(companies, eq(companies.id, matches.companyId))
    .where(
      and(
        isNotNull(matches.rank),
        force ? undefined : isNull(matches.judgedAt),
        slugs?.length ? inArray(companies.slug, [...slugs]) : undefined,
      ),
    )
    .groupBy(companies.id, companies.slug, companies.name)
    .orderBy(asc(companies.slug));
}

export type JudgeCoverage = { mode: MatchMode; ranked: number; judged: number; kept: number; rejected: number; unjudged: number };

/** Ranked rows per mode and state, for the script's summary. */
export async function judgeCoverage(): Promise<JudgeCoverage[]> {
  const rows = await getDb()
    .select({
      mode: matches.mode,
      ranked: count(),
      judged: sql<number>`count(*) filter (where ${matches.judgedAt} is not null)`.mapWith(Number),
      rejected: sql<number>`count(*) filter (where ${matches.judgedAt} is not null and ${matches.rejected})`.mapWith(Number),
    })
    .from(matches)
    .where(isNotNull(matches.rank))
    .groupBy(matches.mode)
    .orderBy(asc(matches.mode));
  return rows.map((r) => ({ ...r, kept: r.judged - r.rejected, unjudged: r.ranked - r.judged }));
}
