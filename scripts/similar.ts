/**
 * Nearest neighbours of one company's public embedding (A14), to see whether
 * the vectors make sense.
 *
 *   npm run similar -- embeddedart
 *
 * Prints the 10 nearest opportunities (fixtures left out) and the 5 nearest
 * other companies, by cosine similarity. Reads DATABASE_URL from .env.local.
 * Run the enrichment first (npm run enrich).
 */
import { and, asc, cosineDistance, eq, isNotNull, ne, notLike, sql } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { companies, opportunities } from "../lib/db/schema";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npm run similar -- <company-slug>");
    process.exitCode = 1;
    return;
  }
  const db = getDb();
  const [company] = await db
    .select({ id: companies.id, name: companies.name, tags: companies.tags, embedding: companies.publicEmbedding })
    .from(companies)
    .where(eq(companies.slug, slug));
  if (!company) throw new Error(`No company with slug "${slug}".`);
  if (!company.embedding) throw new Error(`${company.name} has no public embedding yet. Run npm run enrich first.`);

  const opportunityDistance = cosineDistance(opportunities.embedding, company.embedding);
  const nearest = await db
    .select({
      similarity: sql<number>`1 - (${opportunityDistance})`,
      kind: opportunities.kind,
      source: opportunities.source,
      title: opportunities.title,
      tags: opportunities.tags,
    })
    .from(opportunities)
    .where(and(isNotNull(opportunities.embedding), notLike(opportunities.externalId, "fixture-%")))
    .orderBy(asc(opportunityDistance))
    .limit(10);

  const companyDistance = cosineDistance(companies.publicEmbedding, company.embedding);
  const neighbours = await db
    .select({ similarity: sql<number>`1 - (${companyDistance})`, name: companies.name, slug: companies.slug, tags: companies.tags })
    .from(companies)
    .where(and(isNotNull(companies.publicEmbedding), ne(companies.id, company.id)))
    .orderBy(asc(companyDistance))
    .limit(5);

  const sim = (value: number) => Number(value).toFixed(3);
  const tags = (list: string[]) => (list.length ? `[${list.join(", ")}]` : "[]");
  console.log(`${company.name} ${tags(company.tags)}\n\nNearest opportunities:`);
  for (const o of nearest) console.log(`  ${sim(o.similarity)}  ${o.kind.padEnd(7)}  ${o.title.slice(0, 80)}  ${tags(o.tags)}  (${o.source})`);
  console.log("\nNearest companies:");
  for (const c of neighbours) console.log(`  ${sim(c.similarity)}  ${c.name} (${c.slug})  ${tags(c.tags)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
