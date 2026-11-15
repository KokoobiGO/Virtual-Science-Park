/**
 * Judge one company's ranked matches (A16): the model reads the profile and
 * five matches at a time and writes why, a next step and the uncertainties,
 * or rejects a match. It cannot add one. Eligibility stays "potential_match".
 *
 *   await inngest.send({ name: "app/company.judge.requested", data: { slug: "embeddedart" } })
 *   await inngest.send({ name: "app/company.judge.requested", data: { slug: "embeddedart", force: true } })
 *
 * Without `force` only ranked rows that were never judged are done; with it,
 * every ranked row again. Each model call is its own step (a step may take
 * 30 s at most on Netlify); see lib/judge/company.ts for the rounds. A rate
 * limit (429) fails the step and Inngest tries it again a minute later.
 *
 * With `cards: true` (sent by the match job after a re-rank, C8) it asks for
 * the company's "Your week" cards to be built again when it is done:
 *
 *   await inngest.send({ name: "app/company.judge.requested", data: { slug: "embeddedart", cards: true } })
 */
import { NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { isRateLimit, judgeCompany, type JudgeCompanyResult, type StepRunner } from "@/lib/judge/company";
import { UnknownCompanyError } from "@/lib/judge/store";
import { inngest } from "../client";

const JudgeRequest = z.object({
  slug: z.string().min(1),
  force: z.boolean().default(false),
  /** Build the company's week cards again when done. */
  cards: z.boolean().default(false),
});

/** The run's output: the counts, and the judged lines without the long texts. */
export type JudgeCompanyJobResult = Omit<JudgeCompanyResult, "lines"> & {
  lines: { mode: string; rank: number; verdict: string; copied: boolean; title: string }[];
};

export const judgeCompanyJob = inngest.createFunction(
  {
    id: "judge-company",
    name: "Judge one company's matches",
    retries: 1,
    // The Claude key is rate limited. Inngest counts steps, not runs: at most two steps of this job run at once.
    concurrency: { limit: 2 },
    triggers: [{ event: "app/company.judge.requested" }],
  },
  async ({ event, step }): Promise<JudgeCompanyJobResult> => {
    const request = JudgeRequest.safeParse(event.data);
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { slug, force, cards } = request.data;

    // Every database read and model call runs inside a step, so a replay sees the same plan.
    const run: StepRunner = (name, work) =>
      step.run(name, async () => {
        try {
          return await work();
        } catch (error) {
          if (isRateLimit(error)) throw new RetryAfterError((error as Error).message, "60s", { cause: error });
          if (error instanceof UnknownCompanyError) throw new NonRetriableError(error.message);
          throw error;
        }
      }) as unknown as ReturnType<typeof work>;

    const result = await judgeCompany(slug, { force, run });

    await step.run("record run", async () => {
      await getDb()
        .insert(jobRuns)
        .values({
          job: "judge-company",
          trigger: event.name,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          stats: {
            company: slug,
            force,
            privateData: result.privateData,
            rounds: result.rounds,
            judged: result.judged,
            copied: result.copied,
            kept: result.kept,
            rejected: result.rejected,
            unjudged: result.failed,
            retries: result.retries,
            calls: result.usage.calls,
            modelSeconds: result.modelSeconds,
            refill: result.refill,
            cards,
          },
        });
    });

    // The cards are built from judged rows: now they can follow the new ranking.
    if (cards) await step.sendEvent("request cards", { name: "app/cards.requested", data: { slugs: [slug] } });

    return {
      ...result,
      lines: result.lines.map((l) => ({ mode: l.mode, rank: l.rank, verdict: l.verdict, copied: l.copied, title: l.title })),
    };
  },
);
