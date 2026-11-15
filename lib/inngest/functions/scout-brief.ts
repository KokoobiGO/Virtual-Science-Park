/**
 * Scout (B3, B4): research one member question and write a cited brief.
 * POST /api/scout creates the `briefs` row and sends the event:
 *
 *   await inngest.send({ name: "app/scout.requested", data: { briefId: "<uuid>" } })
 *
 * Every model call, search and page read is its own step (a step may take
 * 30 s at most on Netlify), and each step writes the progress lines to the
 * row, so the page can poll GET /api/scout/<id>. The run keeps itself under
 * 300 s (lib/scout/agent.ts); a rate limit (429) fails the step and Inngest
 * tries it again a minute later. When the job gives up, the row is marked
 * failed with the error (onFailure).
 */
import { NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { isRateLimit, type StepRunner } from "@/lib/scout/agent";
import { runScoutBrief } from "@/lib/scout/run";
import { markFailed, recordRun, UnknownBriefError } from "@/lib/scout/store";
import { SCOUT_EVENT } from "@/lib/scout/types";
import { inngest } from "../client";

const ScoutRequest = z.object({ briefId: z.uuid() });

/** The run's output: the counts and the option titles, without the long texts. */
export type ScoutBriefJobResult =
  | { skipped: true; briefId: string; status: string }
  | {
      skipped: false;
      briefId: string;
      company: string;
      ok: boolean;
      error: string | null;
      seconds: number;
      calls: number;
      searches: number;
      pagesRead: number;
      loopEnd: string;
      webSearch: string;
      options: { title: string; url: string }[];
    };

export const scoutBriefJob = inngest.createFunction(
  {
    id: "scout-brief",
    name: "Scout: research brief",
    retries: 2,
    // The Claude key is rate limited and shared with the judge and the profiler. Inngest counts steps, not runs.
    concurrency: { limit: 2 },
    triggers: [{ event: SCOUT_EVENT }],
    onFailure: async ({ event, error, step }) => {
      const request = ScoutRequest.safeParse(event.data.event?.data);
      if (!request.success) return { marked: false };
      const marked = await step.run("mark brief failed", () => markFailed(request.data.briefId, `Scout stopped: ${error.message}`));
      return { marked };
    },
  },
  async ({ event, step }): Promise<ScoutBriefJobResult> => {
    const request = ScoutRequest.safeParse(event.data);
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { briefId } = request.data;

    // Every database read, search, page read and model call runs inside a step, so a replay sees the same run.
    const run: StepRunner = (name, work) =>
      step.run(name, async () => {
        try {
          return await work();
        } catch (error) {
          if (isRateLimit(error)) throw new RetryAfterError((error as Error).message, "60s", { cause: error });
          if (error instanceof UnknownBriefError) throw new NonRetriableError(error.message);
          throw error;
        }
      }) as unknown as ReturnType<typeof work>;

    const outcome = await runScoutBrief(briefId, { run });
    if (outcome.skipped) return outcome;

    const seconds = await step.run("record run", async () => {
      const finished = Date.now();
      await recordRun({
        job: "scout-brief",
        trigger: event.name,
        ok: outcome.brief !== null,
        startedAt: new Date(outcome.startedAt),
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        stats: {
          company: outcome.company.slug,
          briefId,
          seconds: Math.round((finished - outcome.startedAt) / 1000),
          calls: outcome.usage.calls,
          searches: outcome.searches,
          pagesRead: outcome.pagesRead,
          options: outcome.brief?.options.length ?? 0,
          loopEnd: outcome.loopEnd,
          writes: outcome.writes.map((w) => ({ attempt: w.attempt, given: w.given, accepted: w.accepted })),
          webSearch: outcome.webSearch,
          webProblem: outcome.webProblem,
        },
        error: outcome.error,
      });
      return Math.round((finished - outcome.startedAt) / 1000);
    });

    return {
      skipped: false,
      briefId,
      company: outcome.company.slug,
      ok: outcome.brief !== null,
      error: outcome.error,
      seconds,
      calls: outcome.usage.calls,
      searches: outcome.searches,
      pagesRead: outcome.pagesRead,
      loopEnd: outcome.loopEnd,
      webSearch: outcome.webSearch,
      options: outcome.brief?.options.map((o) => ({ title: o.title, url: o.citation.url })) ?? [],
    };
  },
);
