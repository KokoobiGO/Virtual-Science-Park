/**
 * Rank the opportunities for companies (A15) from the command line, with the
 * same functions the match-companies job uses. SQL only: no model calls.
 *
 *   tsx scripts/match.ts embeddedart --dry           print the ranking in both modes; store nothing
 *   tsx scripts/match.ts --dry --top 5               the top 5 of every company
 *   tsx scripts/match.ts embeddedart techinova       store the ranking for these companies
 *   tsx scripts/match.ts                             store the ranking for every company
 *   tsx scripts/match.ts embeddedart --top 10        store, then print the stored top 10
 *
 * Reads DATABASE_URL from .env.local (run it with --env-file-if-exists=.env.local).
 * --top defaults to 10 for printing; 20 rows per mode are always ranked and stored.
 */
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { matches, opportunities } from "../lib/db/schema";
import { rankCompany } from "../lib/matcher/rank";
import { TOP_N } from "../lib/matcher/score";
import { companiesToMatch, isSkipped, rankAndStore, type CompanyToMatch } from "../lib/matcher/store";
import { MatchMode, type ScoreBreakdown } from "../lib/schemas";

type Line = { rank: number; score: number; scoreBreakdown: ScoreBreakdown; kind: string; title: string };

function parseArgs(args: string[]) {
  const dry = args.includes("--dry");
  const topAt = args.indexOf("--top");
  let top: number | undefined;
  if (topAt >= 0) {
    top = Number(args[topAt + 1]);
    if (!Number.isInteger(top) || top < 1 || top > TOP_N) throw new Error(`--top needs a whole number from 1 to ${TOP_N}.`);
  }
  const slugs = args.filter((arg, i) => !arg.startsWith("--") && i !== topAt + 1);
  return { dry, top, slugs };
}

const n = (value: number) => value.toFixed(3);

function print(company: CompanyToMatch, mode: MatchMode, lines: Line[], heading: string) {
  console.log(`\n${company.name} (${company.slug}), ${mode}: ${heading}`);
  if (lines.length) console.log("   #  score    sim    tag    pri    urg     fb  kind     title");
  for (const l of lines) {
    const b = l.scoreBreakdown;
    console.log(
      `  ${String(l.rank).padStart(2)}  ${n(l.score)}  ${n(b.similarity)}  ${n(b.tagOverlap)}  ${n(b.priorityBoost)}  ${n(b.urgency)}  ${b.feedback < 0 ? "" : " "}${n(b.feedback)}  ${l.kind.padEnd(7)}  ${l.title.slice(0, 90)}`,
    );
  }
}

/** Kind and title for each opportunity id. */
async function describe(ids: string[]) {
  if (!ids.length) return new Map<string, { kind: string; title: string }>();
  const rows = await getDb()
    .select({ id: opportunities.id, kind: opportunities.kind, title: opportunities.title })
    .from(opportunities)
    .where(inArray(opportunities.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

async function dryRun(targets: CompanyToMatch[], top: number) {
  for (const company of targets) {
    for (const mode of MatchMode.options) {
      const rows = await rankCompany(getDb(), company.id, mode);
      const shown = rows.slice(0, top);
      const info = await describe(shown.map((r) => r.opportunityId));
      print(
        company,
        mode,
        shown.map((r) => ({ ...r, kind: info.get(r.opportunityId)?.kind ?? "?", title: info.get(r.opportunityId)?.title ?? "?" })),
        `${rows.length} ranked`,
      );
    }
  }
}

/** What is stored now: the ranked rows up to `top`. */
async function printStored(company: CompanyToMatch, top: number) {
  for (const mode of MatchMode.options) {
    const rows = await getDb()
      .select({ rank: matches.rank, score: matches.score, scoreBreakdown: matches.scoreBreakdown, kind: opportunities.kind, title: opportunities.title })
      .from(matches)
      .innerJoin(opportunities, eq(opportunities.id, matches.opportunityId))
      .where(and(eq(matches.companyId, company.id), eq(matches.mode, mode), isNotNull(matches.rank), lte(matches.rank, top)))
      .orderBy(asc(matches.rank));
    print(company, mode, rows.map((r) => ({ ...r, rank: r.rank! })), `stored top ${top}`);
  }
}

async function main() {
  const { dry, top, slugs } = parseArgs(process.argv.slice(2));
  const targets = await companiesToMatch({ slugs });
  console.log(`${targets.length} companies${dry ? " (dry run: nothing is stored)" : ""}`);
  if (dry) return dryRun(targets, top ?? 10);

  const started = Date.now();
  const total = { personal: 0, public: 0, unranked: 0, skipped: 0 };
  for (const company of targets) {
    const stored = await rankAndStore(company.id);
    const parts = MatchMode.options.map((mode) => {
      const outcome = stored[mode];
      if (isSkipped(outcome)) {
        total.skipped++;
        return `${mode} skipped (${outcome.skipped})`;
      }
      total[mode] += outcome.ranked;
      total.unranked += outcome.unranked;
      return `${mode} ${String(outcome.ranked).padStart(2)} (${outcome.unranked} unranked)`;
    });
    console.log(`${company.slug.padEnd(30)} ${parts.join(", ")}, ${stored.ms} ms`);
    if (top) await printStored(company, top);
  }
  console.log(
    `\nstored: ${total.personal} personal and ${total.public} public rows for ${targets.length} companies; ${total.unranked} older rows lost their rank; ${total.skipped} modes skipped; ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
