/**
 * Send one event and wait for the run it starts, through Inngest's REST API
 * (signed with INNGEST_SIGNING_KEY). For staff tools that show a job's result
 * on the page; jobs themselves never need this.
 */
import { inngest } from "./client";

export type InngestRun = { run_id: string; status: string; output?: unknown };

const DONE = new Set(["Completed", "Failed", "Cancelled"]);

export const isFinished = (run: InngestRun | undefined) => !!run && DONE.has(run.status);

/** Null when the keys are there and events go to Inngest Cloud; otherwise what is wrong. */
export function inngestCloudProblem(): string | null {
  const missing = ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"].filter((name) => !process.env[name]);
  if (missing.length) return `${missing.join(", ")} not set.`;
  if (process.env.INNGEST_DEV === "1") return "INNGEST_DEV=1 sends events to a local dev server. Remove it here.";
  return null;
}

/** The runs an event started; empty until Inngest has picked the event up. */
export async function runsFor(eventId: string): Promise<InngestRun[]> {
  const base = (process.env.INNGEST_API_BASE_URL || "https://api.inngest.com").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/events/${eventId}/runs`, {
    headers: { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}` },
  });
  if (!res.ok) throw new Error(`Inngest API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { data: InngestRun[] | null }).data ?? [];
}

/**
 * Sends the event and asks every 2 s until its run has finished or `waitMs`
 * has passed. `run` is undefined when no run started, and may be unfinished.
 */
export async function sendAndWait(
  event: { name: string; data: Record<string, unknown> },
  waitMs: number,
): Promise<{ eventId: string; run: InngestRun | undefined; seconds: number }> {
  const started = Date.now();
  const { ids } = await inngest.send(event);
  const eventId = ids[0];

  let run: InngestRun | undefined;
  while (Date.now() - started < waitMs) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    run = (await runsFor(eventId))[0];
    if (isFinished(run)) break;
  }
  return { eventId, run, seconds: Math.round((Date.now() - started) / 1000) };
}
