/**
 * Profile one company (A6): fetch its pages, ask the profiler for claims,
 * check every quote against the stored page text, give failed claims one
 * retry, and store what passed.
 *
 *   await inngest.send({ name: "app/company.profile.requested", data: { slug: "techinova" } })
 *
 * With `dryRun: true` nothing but the page snapshots is stored and the claims
 * come back in the run's output. Each model call is its own step, because a
 * step may take 30 s at most on Netlify.
 *
 * The company row gets a status (A8): "profiled" or "thin" when the profile is
 * stored, "failed" when the run gives up (see onFailure).
 *
 * With `refresh: true` (the weekly re-crawl, A23) the run stops after fetching
 * when no page has changed, and otherwise stores only real changes, as
 * suggested updates next to the active claims. The company's status and note
 * stay as they are, also when the run fails.
 */
import { eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { companies, jobRuns, snapshots } from "@/lib/db/schema";
import { runProfiler, type DraftClaim, type ProfilerSource } from "@/lib/profiler";
import { assessProfile, type ProfileAssessment } from "@/lib/profiler/assess";
import { storeProfile, type StoredProfile } from "@/lib/profiler/store";
import { mergeRetry, retryFeedback, verifyDraftClaims } from "@/lib/profiler/verify";
import type { ProfileField } from "@/lib/schemas";
import { fetchSnapshot } from "@/lib/snapshots";
import { inngest } from "../client";

const ProfileRequest = z.object({
  slug: z.string().min(1),
  dryRun: z.boolean().default(false),
  /** The weekly re-crawl (A23): skip unchanged pages, store changes as suggestions. */
  refresh: z.boolean().default(false),
  /** Optional overrides, for trying things without a code change. */
  model: z.string().min(1).optional(),
  thinking: z.boolean().optional(),
});

/** What onFailure needs from the original event. Loose on purpose: it must not throw. */
const FailedRequest = z.object({ slug: z.string().min(1), dryRun: z.boolean().optional(), refresh: z.boolean().optional() });

/** Longest error message kept in companies.profile_note. */
const MAX_FAILURE_CHARS = 300;

export type CompanyProfileResult = {
  company: string;
  sources: { url: string; chars: number }[];
  model: string;
  /** Seconds the model took: first answer, then the retry if there was one. */
  seconds: number[];
  tokens: { input: number; output: number };
  /** Quotes found word for word in their snapshot, over both answers. */
  quotes: { found: number; total: number };
  /** Fields that failed the quote check in the first answer. */
  retried: ProfileField[];
  /** Fields that failed again and are stored as "missing". */
  dropped: ProfileField[];
  /** "thin" when too few fields could be supported with quotes (lib/profiler/assess.ts). */
  status: ProfileAssessment["status"];
  note: string | null;
  stored: StoredProfile | null;
  claims: DraftClaim[];
};

/** A refresh run that stopped because every page it fetched was the same as last time. */
export type SkippedProfileResult = {
  company: string;
  skipped: "unchanged";
  sources: { url: string }[];
  failed: { url: string; error: string }[];
};

/** The snapshots as the profiler reads them: the company's own site first, then BSP's page about it. */
async function loadSources(snapshotIds: string[]): Promise<ProfilerSource[]> {
  const rows = await getDb().select().from(snapshots).where(inArray(snapshots.id, snapshotIds));
  return rows
    .sort((a, b) => snapshotIds.indexOf(a.id) - snapshotIds.indexOf(b.id))
    .map((s) => ({ snapshotId: s.id, source: s.source, url: s.url, lang: s.lang, text: s.contentText }));
}

const errorMessage = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

export const profileCompanyJob = inngest.createFunction(
  {
    id: "profile-company",
    name: "Profile one company",
    retries: 1,
    // The Claude key is rate limited. Inngest counts steps, not runs: at most two steps of this job run at once.
    concurrency: { limit: 2 },
    triggers: [{ event: "app/company.profile.requested" }],
    // Runs once the job has used up its retries. The original event is inside the failure event.
    onFailure: async ({ event, error, step }) => {
      const request = FailedRequest.safeParse(event.data.event?.data);
      // A failed refresh leaves the stored profile as it was, so its status stays too.
      if (!request.success || request.data.dryRun || request.data.refresh) return { marked: false };
      const { slug } = request.data;
      return step.run("mark company failed", async () => {
        const rows = await getDb()
          .update(companies)
          .set({ profileStatus: "failed", profileNote: `Profiling failed: ${errorMessage(error).slice(0, MAX_FAILURE_CHARS)}` })
          .where(eq(companies.slug, slug))
          .returning({ id: companies.id });
        return { marked: rows.length > 0 };
      });
    },
  },
  async ({ event, step }): Promise<CompanyProfileResult | SkippedProfileResult> => {
    const request = ProfileRequest.safeParse(event.data);
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { slug, dryRun, refresh, model, thinking } = request.data;
    const company = await step.run("load company", async () => {
      const [row] = await getDb()
        .select({ id: companies.id, name: companies.name, website: companies.website, memberPage: companies.memberPage })
        .from(companies)
        .where(eq(companies.slug, slug));
      if (!row) throw new NonRetriableError(`No company with slug "${slug}". Run the member import first.`);
      return row;
    });

    const pages = [
      ...(company.website ? [{ url: company.website, source: "company_site" }] : []),
      { url: company.memberPage, source: "bsp_member" },
    ];
    // One failed page must not stop the other: keep what works, and say why the rest failed.
    const { snapshotIds, unchanged, failed } = await step.run("fetch sources", async () => {
      const results = await Promise.allSettled(pages.map((page) => fetchSnapshot({ ...page, companyId: company.id })));
      return {
        snapshotIds: results.flatMap((r) => (r.status === "fulfilled" ? [r.value.snapshot.id] : [])),
        /** Every page that was fetched has the same text as its stored snapshot. */
        unchanged: results.every((r) => r.status === "rejected" || r.value.unchanged),
        failed: results.flatMap((r, i) => (r.status === "rejected" ? [{ url: pages[i].url, error: errorMessage(r.reason) }] : [])),
      };
    });
    if (!snapshotIds.length) {
      throw new NonRetriableError(`Could not fetch any page for ${company.name}: ${failed.map((f) => f.error).join("; ")}`);
    }
    // Nothing new to read: no model call, nothing stored.
    if (refresh && unchanged) {
      return {
        company: company.name,
        skipped: "unchanged",
        sources: pages.filter((p) => !failed.some((f) => f.url === p.url)).map((p) => ({ url: p.url })),
        failed,
      };
    }

    const first = await step.run("profile", async () => {
      const sources = await loadSources(snapshotIds);
      const run = await runProfiler(company.name, sources, { model, thinking });
      const checked = verifyDraftClaims(run.claims, new Map(sources.map((s) => [s.snapshotId, s.text])));
      return { ...checked, injectionFlagged: run.injection.flagged, model: run.model, seconds: run.seconds, usage: run.usage, sources: sources.map((s) => ({ url: s.url, chars: s.text.length })) };
    });

    const retry = first.failed.length
      ? await step.run("retry failed claims", async () => {
          const sources = await loadSources(snapshotIds);
          const run = await runProfiler(company.name, sources, {
            model,
            thinking,
            retry: { fields: first.failed.map((f) => f.field), feedback: retryFeedback(first.failed) },
          });
          const checked = verifyDraftClaims(run.claims, new Map(sources.map((s) => [s.snapshotId, s.text])));
          return { ...checked, seconds: run.seconds, usage: run.usage };
        })
      : null;

    const { claims, dropped } = mergeRetry(first, retry);
    const assessment = assessProfile(claims, { fetched: pages.filter((p) => !failed.some((f) => f.url === p.url)), failed });
    const result: Omit<CompanyProfileResult, "stored"> = {
      company: company.name,
      sources: first.sources,
      model: first.model,
      seconds: [first.seconds, ...(retry ? [retry.seconds] : [])],
      tokens: {
        input: (first.usage?.promptTokens ?? 0) + (retry?.usage?.promptTokens ?? 0),
        output: (first.usage?.completionTokens ?? 0) + (retry?.usage?.completionTokens ?? 0),
      },
      quotes: { found: first.quotes.found + (retry?.quotes.found ?? 0), total: first.quotes.total + (retry?.quotes.total ?? 0) },
      retried: first.failed.map((f) => f.field),
      dropped,
      status: assessment.status,
      note: assessment.note,
      claims,
    };
    if (dryRun) return { ...result, stored: null };

    const stored = await step.run("store profile", async () => {
      const saved = await storeProfile(company.id, claims, assessment, { refresh });
      await getDb()
        .insert(jobRuns)
        .values({
          job: "profile-company",
          trigger: event.name,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          inputTokens: result.tokens.input,
          outputTokens: result.tokens.output,
          stats: { company: slug, refresh, quotes: result.quotes, retried: result.retried, dropped: result.dropped, stored: saved },
        });
      return saved;
    });

    return { ...result, stored };
  },
);
