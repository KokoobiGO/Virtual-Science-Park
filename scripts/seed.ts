/**
 * Load the fixtures into the database (S9).
 *
 *   npm run db:seed
 *
 * Safe to run again: fixture companies and opportunities are upserted, and
 * their claims, evidence, snapshots and matches are replaced. Real (non-fixture)
 * rows are never touched. Every row it writes is marked simulated.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { FIXTURE_RETRIEVED_AT, loadFixtures } from "../data/fixtures";
import { closeDb, getDb } from "../lib/db";
import {
  claims,
  companies,
  companyPrivate,
  evidence,
  matches,
  opportunities,
  snapshots,
  sourceStatus,
} from "../lib/db/schema";
import { combineScore, toPublicBreakdown, type MatchMode } from "../lib/schemas";

const retrievedAt = new Date(FIXTURE_RETRIEVED_AT);

/** Fixture dates are calendar days in Swedish time; deadlines close at the end of the day. */
function day(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:00" : "00:00:00"}+01:00`);
}

/** The data status panel rows the fixtures stand in for. */
const FIXTURE_SOURCES = [
  { source: "vinnova", label: "Vinnova" },
  { source: "energimyndigheten", label: "Energimyndigheten" },
  { source: "eu_funding", label: "EU Funding & Tenders" },
  { source: "regional", label: "Region Blekinge, Almi" },
  { source: "testbeds", label: "Testbeds (curated list)" },
  { source: "tcl_events", label: "Tech Concept Lab events" },
  { source: "bsp_events", label: "BSP events" },
  { source: "bsp_news", label: "BSP news" },
];

async function main() {
  const fixtures = loadFixtures();
  const db = getDb();

  const counts = await db.transaction(async (tx) => {
    // Companies and their private settings.
    const companyIds = new Map<string, string>();
    for (const c of fixtures.companies) {
      const [row] = await tx
        .insert(companies)
        .values({
          slug: c.slug,
          name: c.name,
          website: c.website,
          websiteMissing: c.website === null,
          memberPage: c.memberPage,
          industry: c.industry ?? null,
          isGold: c.isGold,
          lastProfiledAt: retrievedAt,
        })
        .onConflictDoUpdate({
          target: companies.slug,
          set: {
            name: c.name,
            website: c.website,
            websiteMissing: c.website === null,
            memberPage: c.memberPage,
            industry: c.industry ?? null,
            isGold: c.isGold,
            lastProfiledAt: retrievedAt,
          },
        })
        .returning({ id: companies.id });
      companyIds.set(c.slug, row.id);

      await tx
        .insert(companyPrivate)
        .values({ companyId: row.id, userPriorities: c.userPriorities })
        .onConflictDoUpdate({ target: companyPrivate.companyId, set: { userPriorities: c.userPriorities } });
    }
    const ids = [...companyIds.values()];

    // Replace this company's fixture profile. Claims cascade to evidence.
    await tx.delete(matches).where(inArray(matches.companyId, ids));
    await tx.delete(claims).where(inArray(claims.companyId, ids));
    await tx.delete(snapshots).where(and(inArray(snapshots.companyId, ids), eq(snapshots.simulated, true)));

    let claimCount = 0;
    let evidenceCount = 0;
    for (const c of fixtures.companies) {
      const companyId = companyIds.get(c.slug)!;
      const snapshotIds = new Map<string, { id: string; url: string; lang: "sv" | "en" | "other" }>();
      for (const s of c.snapshots) {
        const [row] = await tx
          .insert(snapshots)
          .values({
            companyId,
            source: s.source,
            url: s.url,
            title: `Fixture text for ${c.name}`,
            contentText: s.text,
            contentHash: createHash("sha256").update(s.text).digest("hex"),
            lang: s.lang,
            retrievedAt,
            simulated: true,
          })
          .returning({ id: snapshots.id });
        snapshotIds.set(s.key, { id: row.id, url: s.url, lang: s.lang });
      }

      const superseded = new Map<string, string>();
      for (const claim of c.claims) {
        const [row] = await tx
          .insert(claims)
          .values({
            companyId,
            field: claim.field,
            value: claim.value,
            status: claim.status,
            confidence: claim.confidence,
            updatedBy: claim.updatedBy,
            visibility: claim.visibility,
            reviewState: claim.reviewState,
            supersedesId: claim.reviewState === "active" ? (superseded.get(claim.field) ?? null) : null,
          })
          .returning({ id: claims.id });
        claimCount++;
        if (claim.reviewState === "superseded") superseded.set(claim.field, row.id);

        for (const e of claim.evidence) {
          const snapshot = snapshotIds.get(e.snapshot)!;
          await tx.insert(evidence).values({
            claimId: row.id,
            snapshotId: snapshot.id,
            url: snapshot.url,
            quote: e.quote,
            quoteLang: snapshot.lang,
            retrievedAt,
            quoteCheckedAt: retrievedAt,
          });
          evidenceCount++;
        }
      }
    }

    // Opportunities, upserted on (source, external id).
    const opportunityIds = new Map<string, string>();
    for (const o of fixtures.opportunities) {
      const values = {
        kind: o.kind,
        source: o.source,
        externalId: o.externalId,
        title: o.title,
        url: o.url,
        description: o.description ?? null,
        publishedAt: day(o.publishedAt),
        opensAt: day(o.opensAt),
        deadline: day(o.deadline, true),
        eventDate: day(o.eventDate),
        format: o.format ?? null,
        verified: o.verified ?? null,
        tags: o.tags,
        retrievedAt,
        simulated: true,
      };
      const [row] = await tx
        .insert(opportunities)
        .values(values)
        .onConflictDoUpdate({ target: [opportunities.source, opportunities.externalId], set: values })
        .returning({ id: opportunities.id });
      opportunityIds.set(o.externalId, row.id);
    }

    // Matches in both modes. Public mode drops the private parts of the score.
    const rows = fixtures.matches.flatMap((m) =>
      (["personal", "public"] as MatchMode[]).map((mode) => {
        const breakdown = mode === "public" ? toPublicBreakdown(m.breakdown) : m.breakdown;
        return {
          companyId: companyIds.get(m.company)!,
          opportunityId: opportunityIds.get(m.opportunity)!,
          mode,
          score: combineScore(breakdown),
          scoreBreakdown: breakdown,
          matchedOn: m.matchedOn,
          why: m.why,
          nextStep: m.nextStep,
          uncertainties: m.uncertainties,
          computedAt: retrievedAt,
          judgedAt: retrievedAt,
        };
      }),
    );
    // Rank within each company and mode, best score first.
    const groups = Map.groupBy(rows, (r) => `${r.companyId}/${r.mode}`);
    for (const group of groups.values()) {
      group.sort((a, b) => b.score - a.score).forEach((r, i) => Object.assign(r, { rank: i + 1 }));
    }
    await tx.insert(matches).values(rows);

    // Data status: everything from the fixtures is simulated.
    for (const s of FIXTURE_SOURCES) {
      await tx
        .insert(sourceStatus)
        .values({ ...s, state: "simulated", lastAttemptAt: retrievedAt, message: "Fixture data from npm run db:seed" })
        .onConflictDoUpdate({
          target: sourceStatus.source,
          set: { state: "simulated", message: "Fixture data from npm run db:seed", updatedAt: sql`now()` },
        });
    }

    return {
      companies: companyIds.size,
      claims: claimCount,
      evidence: evidenceCount,
      opportunities: opportunityIds.size,
      matches: rows.length,
      sources: FIXTURE_SOURCES.length,
    };
  });

  console.log("Fixtures loaded:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
