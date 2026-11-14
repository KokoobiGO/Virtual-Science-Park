/**
 * Weekly profile refresh (A23): every Monday at 04:00 Swedish time, one
 * profile-company run in refresh mode per profiled member, sent as one batch
 * of events. A member whose pages have not changed costs one fetch and no
 * model call; a real change is stored as a suggested update for the member.
 *
 * Start it by hand with the event:
 *
 *   await inngest.send({ name: "app/members.refresh.requested", data: {} })
 */
import { isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { companies, jobRuns } from "@/lib/db/schema";
import { inngest } from "../client";

export type RefreshProfilesResult = { requested: number; slugs: string[] };

export const refreshProfilesJob = inngest.createFunction(
  {
    id: "refresh-profiles",
    name: "Refresh member profiles (weekly)",
    retries: 2,
    triggers: [{ cron: "TZ=Europe/Stockholm 0 4 * * 1" }, { event: "app/members.refresh.requested" }],
  },
  async ({ event, step }): Promise<RefreshProfilesResult> => {
    const trigger = event.name === "inngest/scheduled.timer" ? "cron" : event.name;

    // Only companies with a stored profile: there is nothing to compare a first profile with.
    const slugs = await step.run("list profiled companies", async () => {
      const rows = await getDb()
        .select({ slug: companies.slug })
        .from(companies)
        .where(isNotNull(companies.lastProfiledAt))
        .orderBy(companies.slug);
      return rows.map((r) => r.slug);
    });

    if (slugs.length) {
      await step.sendEvent(
        "request refreshes",
        slugs.map((slug) => ({ name: "app/company.profile.requested", data: { slug, refresh: true } })),
      );
    }

    await step.run("record run", async () => {
      await getDb()
        .insert(jobRuns)
        .values({
          job: "refresh-profiles",
          trigger,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          stats: { requested: slugs.length },
        });
    });

    return { requested: slugs.length, slugs };
  },
);
