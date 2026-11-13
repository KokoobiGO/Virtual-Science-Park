/**
 * Test job for the Inngest wiring (S10). Runs once a day and on demand, and
 * writes a row to job_runs so the run log has something to show from day one.
 *
 * Trigger it by hand from the Inngest dev server, or send the event:
 *   await inngest.send({ name: "app/heartbeat.requested", data: {} })
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobRuns } from "@/lib/db/schema";
import { inngest } from "../client";

export const heartbeat = inngest.createFunction(
  {
    id: "heartbeat",
    name: "Heartbeat (test job)",
    triggers: [{ cron: "TZ=Europe/Stockholm 0 6 * * *" }, { event: "app/heartbeat.requested" }],
  },
  async ({ event, step }) => {
    const trigger = event.name === "inngest/scheduled.timer" ? "cron" : event.name;

    const runId = await step.run("record start", async () => {
      if (!process.env.DATABASE_URL) return null;
      const [row] = await getDb().insert(jobRuns).values({ job: "heartbeat", trigger }).returning({ id: jobRuns.id });
      return row.id;
    });

    const checkedAt = await step.run("check", () => new Date().toISOString());

    await step.run("record finish", async () => {
      if (!runId) return;
      await getDb()
        .update(jobRuns)
        .set({ status: "succeeded", finishedAt: new Date(), stats: { checkedAt } })
        .where(eq(jobRuns.id, runId));
    });

    return { ok: true, trigger, checkedAt, recorded: Boolean(runId) };
  },
);
