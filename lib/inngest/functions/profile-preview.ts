/**
 * Profiler preview (A5): profiles one company and returns the draft claims,
 * without storing any claim. It shows that the prompt and output schema work
 * on a real company; the full pipeline with retry and storage is A6.
 *
 *   await inngest.send({ name: "app/profile.preview.requested", data: { slug: "techinova" } })
 *
 * It does store the two pages it reads as snapshots (the company's home page
 * and its BSP member page), so quotes can be checked against them.
 */
import { eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { companies, snapshots } from "@/lib/db/schema";
import { runProfiler, type DraftClaim, type ProfilerSource } from "@/lib/profiler";
import { verifyQuote } from "@/lib/quote-check";
import { fetchSnapshot } from "@/lib/snapshots";
import { inngest } from "../client";

const PreviewRequest = z.object({
  slug: z.string().min(1),
  /** Optional overrides, for trying things without a deploy. */
  model: z.string().min(1).optional(),
  thinking: z.boolean().optional(),
});

export type ProfilePreviewResult = {
  company: string;
  sources: { id: string; url: string; chars: number }[];
  model: string;
  seconds: number;
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number } | null;
  /** How many quotes are word for word in their snapshot (A4). */
  quotes: { found: number; total: number };
  claims: (Omit<DraftClaim, "evidence"> & { evidence: { url: string; quote: string; found: boolean }[] })[];
};

export const profilePreviewJob = inngest.createFunction(
  { id: "profile-preview", name: "Profile one company (preview, nothing stored)", retries: 1, triggers: [{ event: "app/profile.preview.requested" }] },
  async ({ event, step }): Promise<ProfilePreviewResult> => {
    const request = PreviewRequest.safeParse(event.data);
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { slug, model, thinking } = request.data;

    const company = await step.run("load company", async () => {
      const [row] = await getDb()
        .select({ id: companies.id, name: companies.name, website: companies.website, memberPage: companies.memberPage })
        .from(companies)
        .where(eq(companies.slug, slug));
      if (!row) throw new NonRetriableError(`No company with slug "${slug}". Run the member import first.`);
      return row;
    });

    // One failed page must not stop the other: collect what works.
    const fetched = await step.run("fetch sources", async () => {
      const pages = [
        ...(company.website ? [{ url: company.website, source: "company_site" }] : []),
        { url: company.memberPage, source: "bsp_member" },
      ];
      const results = await Promise.allSettled(pages.map((page) => fetchSnapshot({ ...page, companyId: company.id })));
      return results.flatMap((r) => (r.status === "fulfilled" ? [r.value.snapshot.id] : []));
    });
    if (!fetched.length) throw new NonRetriableError(`Could not fetch any page for ${company.name}.`);

    return step.run("profile", async () => {
      const rows = await getDb().select().from(snapshots).where(inArray(snapshots.id, fetched));
      // The company's own site first, then BSP's page about it.
      const sources: ProfilerSource[] = rows
        .sort((a, b) => fetched.indexOf(a.id) - fetched.indexOf(b.id))
        .map((s) => ({ snapshotId: s.id, source: s.source, url: s.url, lang: s.lang, text: s.contentText }));
      const text = new Map(sources.map((s) => [s.snapshotId, s.text]));

      const run = await runProfiler(company.name, sources, { model, thinking });
      const claims = run.claims.map((claim) => ({
        ...claim,
        evidence: claim.evidence.map((e) => ({ url: e.url, quote: e.quote, found: verifyQuote(e.quote, text.get(e.snapshotId) ?? "").found })),
      }));
      const quotes = claims.flatMap((c) => c.evidence);

      return {
        company: company.name,
        sources: sources.map((s, i) => ({ id: `S${i + 1}`, url: s.url, chars: s.text.length })),
        model: run.model,
        seconds: run.seconds,
        finishReason: run.finishReason,
        usage: run.usage,
        quotes: { found: quotes.filter((q) => q.found).length, total: quotes.length },
        claims,
      };
    });
  },
);
