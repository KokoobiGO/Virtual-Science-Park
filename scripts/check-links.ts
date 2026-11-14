/**
 * Checks that every card's source link still resolves (A20) and stores the
 * result for the Trust report (one eval_runs row, kind "link_check").
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/check-links.ts [--dry] [--limit N]
 *
 *   --dry       print the result, store nothing
 *   --limit N   check only N links, spread over the hosts
 *
 * The links: every distinct URL of the real opportunities (not the fixture-
 * rows) and every source of the week cards. Prints a count per outcome, then
 * every link that is not ok: broken and blocked one by one, "cannot verify by
 * script" grouped by host. Exits 0 even when links are broken: it is a report,
 * not a gate.
 *
 * Stored summary: { checked, ok, broken, blocked, unverifiable, startedAt,
 * finishedAt }. `checked` is the sum of the four outcomes; `unverifiable`
 * counts links on hosts that answer 200 for any page, which are neither
 * working nor broken. EU portal topic links count as ok or broken from the
 * portal's API, not from the page's own answer (lib/links/sources.ts).
 */
import { execFileSync } from "node:child_process";
import { notLike } from "drizzle-orm";
import { closeDb, getDb } from "../lib/db";
import { evalRuns, opportunities, weekCards } from "../lib/db/schema";
import { checkLinks, type LinkResult } from "../lib/links/check";
import { EU_TOPIC_FOUND } from "../lib/links/sources";

type UsedBy = { kind: "opportunity" | "week_card"; source: string; title: string };

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const limitAt = args.indexOf("--limit");
  const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : undefined;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error("--limit needs a whole number above 0");

  const db = getDb();
  const [opps, cards] = await Promise.all([
    db
      .select({ url: opportunities.url, title: opportunities.title, source: opportunities.source })
      .from(opportunities)
      .where(notLike(opportunities.externalId, "fixture-%")),
    db.select({ sources: weekCards.sources }).from(weekCards),
  ]);

  const usedBy = new Map<string, UsedBy[]>();
  const addUse = (url: string, by: UsedBy) => usedBy.set(url, [...(usedBy.get(url) ?? []), by]);
  for (const o of opps) addUse(o.url, { kind: "opportunity", source: o.source, title: o.title });
  // Week cards are private to a company and eval_runs is public, so a card's
  // own title is not stored: only the title of the page it cites.
  for (const card of cards) {
    for (const s of card.sources) addUse(s.url, { kind: "week_card", source: hostOf(s.url), title: s.title ?? "(no title)" });
  }

  const urls = spreadByHost([...usedBy.keys()]).slice(0, limit);
  console.log(`Checking ${urls.length} of ${usedBy.size} distinct links (${opps.length} opportunities, ${cards.length} week cards)`);

  const startedAt = new Date();
  let done = 0;
  const results = await checkLinks(urls, {
    onResult: () => {
      done++;
      if (done % 25 === 0 && done < urls.length) console.log(`  ${done}/${urls.length}`);
    },
  });
  const finishedAt = new Date();

  const count = (outcome: LinkResult["outcome"]) => results.filter((r) => r.outcome === outcome).length;
  const summary = {
    checked: results.length,
    ok: count("ok"),
    broken: count("broken"),
    blocked: count("blocked"),
    unverifiable: count("unverifiable"),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
  const euFound = results.filter((r) => r.reason === EU_TOPIC_FOUND).length;
  const notes = {
    ok: euFound ? `${euFound} of them EU topics found in the portal API` : "",
    broken: "",
    blocked: "unclear: check by hand",
    unverifiable: "cannot verify by script: the host answers 200 for any page",
  };
  console.log("");
  for (const outcome of ["ok", "broken", "blocked", "unverifiable"] as const) {
    console.log(`${outcome.padEnd(13)} ${String(summary[outcome]).padStart(4)}  ${notes[outcome]}`.trimEnd());
  }
  console.log(`${"checked".padEnd(13)} ${String(summary.checked).padStart(4)}  in ${Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)} s`);

  const order = { broken: 0, blocked: 1, unverifiable: 2, ok: 3 };
  const notOk = results.filter((r) => r.outcome !== "ok").sort((a, b) => order[a.outcome] - order[b.outcome] || a.url.localeCompare(b.url));
  const usedByText = (url: string) => {
    const users = usedBy.get(url) ?? [];
    const shown = users.slice(0, 2).map((u) => `${u.source}: ${clip(u.title, 70)}`);
    if (users.length > 2) shown.push(`and ${users.length - 2} more`);
    return shown.join(" | ");
  };
  for (const r of notOk.filter((n) => n.outcome !== "unverifiable")) {
    console.log(`\n${r.outcome.padEnd(8)} ${String(r.status ?? "-").padEnd(4)} ${r.url}`);
    console.log(`              ${r.reason}`);
    if (r.redirectedTo) console.log(`              ends at ${r.redirectedTo}`);
    console.log(`              used by ${usedByText(r.url)}`);
  }
  const unverifiableByHost = new Map<string, LinkResult[]>();
  for (const r of notOk.filter((n) => n.outcome === "unverifiable")) {
    unverifiableByHost.set(hostOf(r.url), [...(unverifiableByHost.get(hostOf(r.url)) ?? []), r]);
  }
  for (const [host, list] of unverifiableByHost) {
    console.log(`\ncannot verify by script: ${host}, ${list.length} link${list.length === 1 ? "" : "s"}`);
    console.log(`              ${list[0].reason}`);
    for (const r of list) console.log(`              ${r.url}\n                used by ${usedByText(r.url)}`);
  }

  if (dry) {
    console.log("\nDry run: nothing stored.");
    return;
  }
  const details = {
    links: notOk.map((r) => ({
      url: r.url,
      outcome: r.outcome,
      status: r.status,
      reason: r.reason,
      ...(r.redirectedTo ? { redirectedTo: r.redirectedTo } : {}),
      usedBy: usedBy.get(r.url) ?? [],
    })),
  };
  const [row] = await db
    .insert(evalRuns)
    .values({ kind: "link_check", gitSha: gitSha(), summary, details })
    .returning({ id: evalRuns.id });
  console.log(`\nStored eval_runs ${row.id}`);
}

/** Sorted, then one URL per host in turn, so `--limit` samples every host. */
function spreadByHost(urls: string[]): string[] {
  const byHost = new Map<string, string[]>();
  for (const url of [...urls].sort()) byHost.set(hostOf(url), [...(byHost.get(hostOf(url)) ?? []), url]);
  const spread: string[] = [];
  for (let i = 0; spread.length < urls.length; i++) {
    for (const list of byHost.values()) if (i < list.length) spread.push(list[i]);
  }
  return spread;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
