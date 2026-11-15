/**
 * Tag and embed opportunities and companies (A14) from the command line, with
 * the same functions the enrich job uses.
 *
 *   npm run enrich -- --dry               what would be done, with the texts; no model calls
 *   npm run enrich -- --limit 3           the first 3 opportunities and 3 companies
 *   npm run enrich                        everything without an embedding
 *   npm run enrich -- --force             everything again (curated testbed tags stay)
 *
 * Reads DATABASE_URL, ANTHROPIC_API_KEY and VOYAGE_API_KEY from .env.local.
 *
 * A Voyage key without billing allows 3 requests and 10,000 tokens a minute
 * (measured on 2026-11-14), so the script waits before each Voyage request
 * until it fits in the last minute's budget. With billing set up, raise the
 * limits: `--rpm 2000 --tpm 3000000`.
 */
import { closeDb } from "../lib/db";
import {
  addResults,
  emptyEnrichResult,
  enrichCompanies,
  enrichOpportunities,
  ENRICH_CHUNK,
  listPending,
  loadCompanies,
  loadOpportunities,
  type EnrichOptions,
  type EnrichResult,
} from "../lib/embeddings/enrich";
import { ModelApiError } from "../lib/model";
import { OpportunityTag } from "../lib/schemas";
import { VoyageApiError } from "../lib/voyage";

const WINDOW_MS = 62_000;
/** Voyage counted 5.7 characters per token on our mixed Swedish and English texts (2026-11-14); this errs high. */
const CHARS_PER_TOKEN = 4.5;
/** Attempts per chunk when a rate limit answers 429 anyway. */
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const estimateTokens = (texts: string[]) => Math.ceil(texts.reduce((sum, t) => sum + t.length, 0) / CHARS_PER_TOKEN);

/** Waits until a request of this size fits in the last minute's requests and tokens. */
class VoyagePace {
  private calls: { at: number; tokens: number }[] = [];
  constructor(
    private readonly rpm: number,
    private readonly tpm: number,
  ) {}

  async wait(texts: string[]) {
    const tokens = estimateTokens(texts);
    for (;;) {
      const now = Date.now();
      this.calls = this.calls.filter((c) => now - c.at < WINDOW_MS);
      const used = this.calls.reduce((sum, c) => sum + c.tokens, 0);
      if (!this.calls.length || (this.calls.length < this.rpm && used + tokens <= this.tpm)) break;
      const waitMs = this.calls[0].at + WINDOW_MS - now + 250;
      console.log(`  waiting ${Math.ceil(waitMs / 1000)} s for the Voyage limit (${this.calls.length} requests, ~${used} tokens in the last minute; next ~${tokens})`);
      await sleep(waitMs);
    }
    this.calls.push({ at: Date.now(), tokens });
  }

  /** After a 429: count the minute as full. */
  full() {
    this.calls.push({ at: Date.now(), tokens: this.tpm });
  }
}

function numberFlag(args: string[], name: string): number | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = Number(args[i + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} needs a positive whole number.`);
  return value;
}

const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / ENRICH_CHUNK) }, (_, i) => ids.slice(i * ENRICH_CHUNK, (i + 1) * ENRICH_CHUNK));

const tagLine = (r: EnrichResult) =>
  OpportunityTag.options
    .filter((t) => r.tagCounts[t])
    .map((t) => `${t} ${r.tagCounts[t]}`)
    .join(", ") || "none";

async function dryRun(ids: { opportunityIds: string[]; companyIds: string[] }, force: boolean) {
  const opps = (await Promise.all(chunks(ids.opportunityIds).map((c) => loadOpportunities(c, { force })))).flat();
  const comps = (await Promise.all(chunks(ids.companyIds).map((c) => loadCompanies(c)))).flat();
  const oppTexts = opps.map((o) => o.text);
  const compTexts = [...new Set(comps.flatMap((c) => [c.publicText, c.personalText]))];
  console.log(`opportunities: ${opps.length} (${opps.filter((o) => o.needsTags).length} to tag), ~${estimateTokens(oppTexts)} Voyage tokens`);
  for (const o of opps) console.log(`  ${o.needsTags ? "tag+embed" : "embed    "}  ${String(o.text.length).padStart(5)} chars  ${o.source}: ${o.title.slice(0, 70)}`);
  console.log(`companies: ${comps.length}, ${compTexts.length} distinct texts, ~${estimateTokens(compTexts)} Voyage tokens`);
  for (const c of comps) {
    console.log(`  ${c.name}: public ${c.publicText.length} chars${c.personalText === c.publicText ? "" : `, personal ${c.personalText.length} chars`}`);
  }
  if (opps[0]) console.log(`\nFirst opportunity text:\n${opps[0].text}`);
  if (comps[0]) console.log(`\nFirst company public text:\n${comps[0].publicText}`);
}

async function runChunk(label: string, work: (options: EnrichOptions) => Promise<EnrichResult>, pace: VoyagePace): Promise<EnrichResult> {
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const result = await work({ beforeEmbed: (texts) => pace.wait(texts) });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${label}: ${result.enriched} enriched, ${result.tagged} tagged (${result.zeroTags} no tag; ${tagLine(result)}), ${seconds} s`);
      return result;
    } catch (error) {
      const limited = (error instanceof VoyageApiError || error instanceof ModelApiError) && error.status === 429;
      if (!limited || attempt >= MAX_ATTEMPTS) throw error;
      if (error instanceof VoyageApiError) pace.full();
      console.log(`${label}: rate limited (${error.message.slice(0, 120)}); trying again in 60 s`);
      await sleep(60_000);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dry = args.includes("--dry");
  const limit = numberFlag(args, "--limit");
  const pace = new VoyagePace(numberFlag(args, "--rpm") ?? 3, numberFlag(args, "--tpm") ?? 10_000);

  const pending = await listPending({ force, limit });
  console.log(`pending: ${pending.opportunityIds.length} opportunities, ${pending.companyIds.length} companies${force ? " (force)" : ""}`);
  if (dry) return dryRun(pending, force);

  const started = Date.now();
  const total = { opportunities: emptyEnrichResult(), companies: emptyEnrichResult() };
  for (const [i, ids] of chunks(pending.opportunityIds).entries()) {
    const label = `opportunities ${i * ENRICH_CHUNK + 1}-${i * ENRICH_CHUNK + ids.length} of ${pending.opportunityIds.length}`;
    addResults(total.opportunities, await runChunk(label, (options) => enrichOpportunities(ids, { ...options, force }), pace));
  }
  for (const [i, ids] of chunks(pending.companyIds).entries()) {
    const label = `companies ${i * ENRICH_CHUNK + 1}-${i * ENRICH_CHUNK + ids.length} of ${pending.companyIds.length}`;
    addResults(total.companies, await runChunk(label, (options) => enrichCompanies(ids, options), pace));
  }

  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  for (const [name, r] of Object.entries(total)) {
    console.log(
      `\n${name}: ${r.enriched} enriched, ${r.tagged} tagged, ${r.zeroTags} with no tag\n  tags: ${tagLine(r)}\n  voyage: ${r.embedded.texts} texts, ${r.embedded.chars} chars\n  tagger: ${r.tagger.calls} calls, ${r.tagger.inputTokens} in / ${r.tagger.outputTokens} out tokens`,
    );
  }
  console.log(`\ndone in ${minutes} min`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
