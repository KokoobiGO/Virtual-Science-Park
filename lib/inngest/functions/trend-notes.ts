/**
 * Write the weekly trend notes (A27): one "what changed and why it matters"
 * note per technology area, from this week's news and new calls.
 *
 *   await inngest.send({ name: "app/trends.requested", data: {} })
 *   await inngest.send({ name: "app/trends.requested", data: { areas: ["marine", "cyber"] } })
 *
 * It also runs every Monday at 05:00 Swedish time, for every area.
 *
 * One step per area: one model call, two when the first note fails its
 * checks, inside Netlify's 30 s. An area with fewer than 2 new inputs, or
 * whose note fails twice, gets no note this week. Running it again in the
 * same week replaces that week's notes.
 */
import { NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { NvidiaApiError } from "@/lib/nvidia";
import { OpportunityTag } from "@/lib/schemas";
import { emptyTrendUsage, trendNoteForArea, weekOf, type TrendOutcome, type TrendUsage } from "@/lib/trends";
import { inngest } from "../client";

const TrendRequest = z.object({ areas: z.array(OpportunityTag).min(1).optional() });

type AreaResult = TrendOutcome | { area: OpportunityTag; status: "error"; error: string };

export type TrendNotesResult = {
  weekOf: string;
  counts: { written: number; too_few_inputs: number; failed_checks: number; error: number };
  usage: TrendUsage;
  areas: AreaResult[];
};

export const trendNotesJob = inngest.createFunction(
  {
    id: "trend-notes",
    name: "Write the weekly trend notes",
    retries: 2,
    // NVIDIA's free key is rate limited: one area at a time.
    concurrency: { limit: 1 },
    triggers: [{ cron: "TZ=Europe/Stockholm 0 5 * * 1" }, { event: "app/trends.requested" }],
  },
  async ({ event, step }): Promise<TrendNotesResult> => {
    const trigger = event.name === "inngest/scheduled.timer" ? "cron" : event.name;
    // A cron run's data holds only the schedule, so no `areas`: every area gets a note.
    const request = TrendRequest.safeParse(event.data ?? {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const areas = request.data.areas ?? OpportunityTag.options;
    // The function body runs again for every step, so the event's time is the stable "now".
    const now = new Date(event.ts ?? Date.now());

    const result: TrendNotesResult = {
      weekOf: weekOf(now),
      counts: { written: 0, too_few_inputs: 0, failed_checks: 0, error: 0 },
      usage: emptyTrendUsage(),
      areas: [],
    };
    for (const area of areas) {
      const outcome = await step.run(`note ${area}`, async (): Promise<{ result: AreaResult; usage: TrendUsage }> => {
        const usage = emptyTrendUsage();
        try {
          return { result: await trendNoteForArea(area, { now, store: true, usage }), usage };
        } catch (error) {
          // A rate limit is not a bug: fail the step and let Inngest try it again after the limit's minute.
          if (error instanceof NvidiaApiError && error.status === 429) throw new RetryAfterError(error.message, "60s", { cause: error });
          // Anything else is recorded, not thrown: the other areas still get their notes.
          return { result: { area, status: "error", error: error instanceof Error ? error.message : String(error) }, usage };
        }
      });
      result.areas.push(outcome.result);
      result.counts[outcome.result.status]++;
      result.usage.calls += outcome.usage.calls;
      result.usage.inputTokens += outcome.usage.inputTokens;
      result.usage.outputTokens += outcome.usage.outputTokens;
    }

    await step.run("record run", async () => {
      const ok = result.counts.error === 0;
      await getDb()
        .insert(jobRuns)
        .values({
          job: "trend-notes",
          trigger,
          status: ok ? "succeeded" : "failed",
          startedAt: now,
          finishedAt: new Date(),
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          stats: {
            weekOf: result.weekOf,
            counts: result.counts,
            calls: result.usage.calls,
            areas: result.areas.map((a) =>
              a.status === "written"
                ? { area: a.area, status: a.status, inputs: a.inputs.length, cited: a.cited, attempts: a.attempts, title: a.title }
                : a.status === "error"
                  ? a
                  : a.status === "failed_checks"
                    ? { area: a.area, status: a.status, inputs: a.inputs.length, problems: a.problems }
                    : { area: a.area, status: a.status, inputs: a.inputs.length },
            ),
          },
          error: ok ? null : `${result.counts.error} areas failed: ${result.areas.flatMap((a) => (a.status === "error" ? [`${a.area}: ${a.error.slice(0, 200)}`] : [])).join("; ")}`,
        });
    });

    return result;
  },
);
