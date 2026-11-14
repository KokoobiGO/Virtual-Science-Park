/**
 * Exports the gold members' profiles for the team's hand-check (A7): one file
 * per member, data/gold-profiles/<slug>.json, with every active public claim
 * the profiler wrote and an open verdict for each. The accuracy eval
 * (scripts/eval.ts profile_accuracy) reads these files.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/gold-export.ts
 *
 * Reads the database; writes only the files. Running it again keeps the
 * team's work: a claim whose id, value and status are unchanged keeps its
 * verdict and note, a changed claim gets an open verdict again (the old one
 * in previousVerdict), and claims no longer active are dropped. Every file is
 * read and checked before any is written, so a broken file stops the run
 * with nothing changed. Prints what was kept, reset, added and dropped.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "../lib/db";
import { GOLD_DIR, formatGoldFile, freshGoldFile, loadGoldCompanies, mergeGoldFile, readGoldFile, type GoldClaim } from "../lib/eval/gold-file";

async function main() {
  const gold = await loadGoldCompanies(getDb());
  if (!gold.length) throw new Error("No gold members (companies.is_gold) in the database.");

  const exportedAt = new Date().toISOString();
  const merges = gold.map((company) => {
    const filePath = path.join(GOLD_DIR, `${company.slug}.json`);
    const previous = readGoldFile(filePath);
    return { filePath, isNew: previous === null, ...mergeGoldFile(previous, freshGoldFile(company, exportedAt)) };
  });

  mkdirSync(GOLD_DIR, { recursive: true });
  const fields = (claims: GoldClaim[]) => claims.map((c) => c.field).join(", ");
  for (const m of merges) {
    if (m.changed) writeFileSync(m.filePath, formatGoldFile(m.file), "utf8");
    const state = m.isNew ? "new file" : m.changed ? "updated" : "unchanged";
    const checked = m.file.claims.filter((c) => c.verdict !== null).length;
    console.log(`\n${m.file.slug}: ${m.filePath.replaceAll("\\", "/")} ${state}, ${m.file.claims.length} claims, ${checked} with a verdict`);
    console.log(`  kept     ${m.kept.length}${m.kept.length ? ` (${m.kept.filter((c) => c.verdict !== null).length} with a verdict)` : ""}`);
    console.log(`  reset    ${m.reset.length}${m.reset.length ? `: ${m.reset.map((c) => `${c.field}${c.previousVerdict ? ` (was ${c.previousVerdict})` : ""}`).join(", ")}` : ""}`);
    console.log(`  added    ${m.added.length}${m.added.length ? `: ${fields(m.added)}` : ""}`);
    console.log(`  dropped  ${m.dropped.length}${m.dropped.length ? `: ${fields(m.dropped)}` : ""}`);
    const lost = m.dropped.filter((c) => c.verdict !== null);
    if (lost.length) {
      console.log(`  WARNING: ${lost.length} dropped claims had a verdict (${lost.map((c) => `${c.field} ${c.verdict}`).join(", ")}); the committed file in git still has them.`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
