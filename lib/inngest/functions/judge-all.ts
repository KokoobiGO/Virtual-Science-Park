/**
 * Judge the matches of every company (A16): one judge-company run per company
 * that has ranked rows to judge, sent as one batch of events. judge-company
 * runs at most two steps at once.
 *
 *   await inngest.send({ name: "app/judge.requested", data: {} })
 *   await inngest.send({ name: "app/judge.requested", data: { slugs: ["embeddedart", "techinova"] } })
 *   await inngest.send({ name: "app/judge.requested", data: { force: true } })
 *
 * Without `force` only companies with ranked rows that were never judged are
 * sent, so running it again picks up what the last run left. With `force:
 * true` every company with ranked rows is judged again.
 */
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { companiesToJudge, UnknownCompanyError } from "@/lib/judge/store";
import { inngest } from "../client";

const JudgeAllRequest = z.object({
  slugs: z.array(z.string().min(1)).optional(),
  force: z.boolean().default(false),
});

export type JudgeAllResult = { requested: number; rows: number; slugs: string[] };

export const judgeAllJob = inngest.createFunction(
  { id: "judge-all", name: "Judge the matches of every company", retries: 2, triggers: [{ event: "app/judge.requested" }] },
  async ({ event, step }): Promise<JudgeAllResult> => {
    const request = JudgeAllRequest.safeParse(event.data ?? {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { slugs, force } = request.data;

    const targets = await step.run("list companies", async () => {
      try {
        return await companiesToJudge({ slugs, force });
      } catch (error) {
        if (error instanceof UnknownCompanyError) throw new NonRetriableError(error.message);
        throw error;
      }
    });

    if (targets.length) {
      await step.sendEvent(
        "request judging",
        targets.map((t) => ({ name: "app/company.judge.requested", data: { slug: t.slug, force } })),
      );
    }

    const rows = targets.reduce((sum, t) => sum + t.pending, 0);
    await step.run("record run", async () => {
      await getDb()
        .insert(jobRuns)
        .values({
          job: "judge-all",
          trigger: event.name,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          stats: { requested: targets.length, rows, force, slugs: slugs ?? null },
        });
    });

    return { requested: targets.length, rows, slugs: targets.map((t) => t.slug) };
  },
);
