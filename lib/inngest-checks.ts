/**
 * Live check for Inngest Cloud (S2, S10), run from /staff/checks with this
 * deploy's keys. It sends the heartbeat event with INNGEST_EVENT_KEY, then asks
 * Inngest's REST API (with INNGEST_SIGNING_KEY) until the run has finished. A
 * PASS means the whole loop works: Inngest accepted the event, knows the synced
 * app and called /api/inngest to run every step.
 */
import { inngestCloudProblem, isFinished, sendAndWait } from "./inngest/runs";
import type { CheckResult } from "./nvidia-checks";

export const INNGEST_CHECKS = {
  heartbeat: "Event runs the heartbeat job",
} as const;

export type InngestCheckId = keyof typeof INNGEST_CHECKS;

export function isInngestCheckId(value: string | null): value is InngestCheckId {
  return value !== null && Object.hasOwn(INNGEST_CHECKS, value);
}

/** Netlify cuts a request off after 30 s, so stop waiting before that. */
const WAIT_MS = 24_000;

export async function runInngestCheck(id: InngestCheckId): Promise<CheckResult> {
  const feature = INNGEST_CHECKS[id];
  const problem = inngestCloudProblem();
  if (problem) return { feature, status: "FAIL", detail: problem };

  try {
    const { eventId, run, seconds } = await sendAndWait(
      { name: "app/heartbeat.requested", data: { from: "staff-checks" } },
      WAIT_MS,
    );
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
    if (isFinished(run)) return { feature, status: "FAIL", detail: `run ${run.run_id} ${run.status}: ${output}` };
    return {
      feature,
      status: "NOTE",
      detail: `run ${run.run_id} started but was still ${run.status} after ${seconds} s. See the Inngest dashboard.`,
    };
  } catch (error) {
    return { feature, status: "FAIL", detail: (error as Error).message };
  }
}
