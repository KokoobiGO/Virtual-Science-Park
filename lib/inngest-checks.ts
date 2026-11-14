/**
 * Live check for Inngest Cloud (S2, S10), run from /staff/checks with this
 * deploy's keys. It sends the heartbeat event with INNGEST_EVENT_KEY, then asks
 * Inngest's REST API (with INNGEST_SIGNING_KEY) until the run has finished. A
 * PASS means the whole loop works: Inngest accepted the event, knows the synced
 * app and called /api/inngest to run every step.
 */
import { inngest } from "./inngest/client";
import type { CheckResult } from "./nvidia-checks";

export const INNGEST_CHECKS = {
  heartbeat: "Event runs the heartbeat job",
} as const;

export type InngestCheckId = keyof typeof INNGEST_CHECKS;

export function isInngestCheckId(value: string | null): value is InngestCheckId {
  return value !== null && Object.hasOwn(INNGEST_CHECKS, value);
}

/** Stays well inside the 60 s limit for one request on Netlify. */
const WAIT_MS = 30_000;
const DONE = new Set(["Completed", "Failed", "Cancelled"]);

type Run = { run_id: string; status: string; output?: unknown };

async function runsFor(eventId: string): Promise<Run[]> {
  const base = (process.env.INNGEST_API_BASE_URL || "https://api.inngest.com").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/events/${eventId}/runs`, {
    headers: { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}` },
  });
  if (!res.ok) throw new Error(`Inngest API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { data: Run[] | null }).data ?? [];
}

export async function runInngestCheck(id: InngestCheckId): Promise<CheckResult> {
  const feature = INNGEST_CHECKS[id];
  const missing = ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"].filter((name) => !process.env[name]);
  if (missing.length) return { feature, status: "FAIL", detail: `${missing.join(", ")} not set.` };
  if (process.env.INNGEST_DEV === "1") {
    return { feature, status: "FAIL", detail: "INNGEST_DEV=1 sends events to a local dev server. Remove it here." };
  }

  try {
    const started = Date.now();
    const { ids } = await inngest.send({ name: "app/heartbeat.requested", data: { from: "staff-checks" } });
    const eventId = ids[0];

    let run: Run | undefined;
    while (Date.now() - started < WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      run = (await runsFor(eventId))[0];
      if (run && DONE.has(run.status)) break;
    }

    const seconds = Math.round((Date.now() - started) / 1000);
    if (!run) {
      return {
        feature,
        status: "FAIL",
        detail: `Inngest accepted event ${eventId} but started no run in ${seconds} s. Sync the app: PUT /api/inngest.`,
      };
    }
    const output = JSON.stringify(run.output ?? null);
    if (run.status === "Completed") {
      return { feature, status: "PASS", detail: `event ${eventId} ran in ${seconds} s, output ${output}` };
    }
    if (DONE.has(run.status)) return { feature, status: "FAIL", detail: `run ${run.run_id} ${run.status}: ${output}` };
    return {
      feature,
      status: "NOTE",
      detail: `run ${run.run_id} started but was still ${run.status} after ${seconds} s. See the Inngest dashboard.`,
    };
  } catch (error) {
    return { feature, status: "FAIL", detail: (error as Error).message };
  }
}
