/**
 * The reads behind the staff screens (C9, C17). They run as the signed-in
 * user, so row-level security applies: staff read public matches and the
 * stored connections, a member reads neither of another company. The pages and
 * the route handler refuse members before they get here.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, like, not } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { companies, connections, matches, opportunities } from "../db/schema";
import { withUserDb, type JwtClaims, type UserTx } from "../db/user";
import { FIXTURE_PREFIX } from "../matcher/score";
import { COMPARE_TOP_N, markShared, topMatches, type CompareItem } from "./compare";
import type { EcoConnection } from "./ecosystem";

export type Member = { id: string; slug: string; name: string };

async function members(tx: UserTx): Promise<Member[]> {
  return tx.select({ id: companies.id, slug: companies.slug, name: companies.name }).from(companies).orderBy(asc(companies.name));
}

/** Every member, by name, for the pickers. */
export async function listMembers(claims: JwtClaims): Promise<Member[]> {
  return withUserDb(claims, members);
}

export type CompareSide = { slug: string; name: string; top: CompareItem[] };
export type Comparison = { a: CompareSide; b: CompareSide; shared: string[] };
export type ComparisonResult = { ok: true; comparison: Comparison } | { ok: false; error: string };

/** Both members' top five from the public ranking. Not found: a slug that is no member. */
export async function loadComparison(claims: JwtClaims, slugA: string, slugB: string): Promise<ComparisonResult> {
  return withUserDb(claims, async (tx) => {
    const found = await tx
      .select({ id: companies.id, slug: companies.slug, name: companies.name })
      .from(companies)
      .where(inArray(companies.slug, [slugA, slugB]));
    const a = found.find((c) => c.slug === slugA);
    const b = found.find((c) => c.slug === slugB);
    if (!a || !b) return { ok: false, error: `No member with the slug "${!a ? slugA : slugB}".` };

    const publicTop = (companyId: string) =>
      tx
        .select({
          opportunityId: matches.opportunityId,
          externalId: opportunities.externalId,
          rank: matches.rank,
          rejected: matches.rejected,
          why: matches.why,
          title: opportunities.title,
          kind: opportunities.kind,
          source: opportunities.source,
          url: opportunities.url,
          simulated: opportunities.simulated,
        })
        .from(matches)
        .innerJoin(opportunities, eq(opportunities.id, matches.opportunityId))
        .where(
          and(
            eq(matches.companyId, companyId),
            eq(matches.mode, "public"),
            isNotNull(matches.rank),
            eq(matches.rejected, false),
            not(like(opportunities.externalId, `${FIXTURE_PREFIX}%`)),
          ),
        )
        .orderBy(asc(matches.rank))
        .limit(COMPARE_TOP_N);

    const topA = topMatches(await publicTop(a.id));
    const topB = topMatches(await publicTop(b.id));
    const marked = markShared(topA, topB);
    return {
      ok: true,
      comparison: {
        a: { slug: a.slug, name: a.name, top: marked.a },
        b: { slug: b.slug, name: b.name, top: marked.b },
        shared: marked.shared,
      },
    };
  });
}

export type Ecosystem = { members: Member[]; connections: EcoConnection[] };

/** Every member and every stored connection, the strongest first. Staff only, by row-level security. */
export async function loadEcosystem(claims: JwtClaims): Promise<Ecosystem> {
  return withUserDb(claims, async (tx) => {
    const a = alias(companies, "company_a");
    const b = alias(companies, "company_b");
    const rows = await tx
      .select({
        id: connections.id,
        aId: connections.companyAId,
        bId: connections.companyBId,
        aName: a.name,
        bName: b.name,
        score: connections.score,
        sharedOn: connections.sharedOn,
        basis: connections.basis,
        evidence: connections.evidence,
        computedAt: connections.computedAt,
      })
      .from(connections)
      .innerJoin(a, eq(a.id, connections.companyAId))
      .innerJoin(b, eq(b.id, connections.companyBId))
      .orderBy(desc(connections.score));
    return {
      members: await members(tx),
      connections: rows.map((r) => ({ ...r, computedAt: r.computedAt.toISOString() })),
    };
  });
}
