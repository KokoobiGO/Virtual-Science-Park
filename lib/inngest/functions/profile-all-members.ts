/**
 * Profile all members (A8): one profile-company run per member, sent as one
 * batch of events. profile-company runs at most two steps at once and marks
 * each company "profiled", "thin" or "failed".
 *
 *   await inngest.send({ name: "app/members.profile.requested", data: {} })
 *
 * Without `force` only companies that were never profiled or failed last time
 * are sent, so running it again picks up where the last run left off. With
 * `force: true` every company is profiled again. `limit` sends the first few
 * (by slug), for a test.
 */
import { eq, isNull, or } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { companies, jobRuns } from "@/lib/db/schema";
import { inngest } from "../client";

const ProfileAllRequest = z.object({
  force: z.boolean().default(false),
  limit: z.number().int().positive().optional(),
});

export type ProfileAllMembersResult = { requested: number; slugs: string[] };

export const profileAllMembersJob = inngest.createFunction(
  { id: "profile-all-members", name: "Profile all members", retries: 2, triggers: [{ event: "app/members.profile.requested" }] },
  async ({ event, step }): Promise<ProfileAllMembersResult> => {
    const request = ProfileAllRequest.safeParse(event.data ?? {});
    if (!request.success) throw new NonRetriableError(`Bad event data: ${request.error.message}`);
    const { force, limit } = request.data;

    const slugs = await step.run("list companies", async () => {
      const query = getDb()
        .select({ slug: companies.slug })
        .from(companies)
        .where(force ? undefined : or(isNull(companies.profileStatus), eq(companies.profileStatus, "failed")))
        .orderBy(companies.slug);
      const rows = await (limit ? query.limit(limit) : query);
      return rows.map((r) => r.slug);
    });

    if (slugs.length) {
      await step.sendEvent(
        "request profiles",
        slugs.map((slug) => ({ name: "app/company.profile.requested", data: { slug } })),
      );
    }

    await step.run("record run", async () => {
      await getDb()
        .insert(jobRuns)
        .values({
          job: "profile-all-members",
          trigger: event.name,
          status: "succeeded",
          // The function body runs again for every step, so the event's time is the stable start.
          startedAt: new Date(event.ts ?? Date.now()),
          finishedAt: new Date(),
          stats: { requested: slugs.length, force },
        });
    });

    return { requested: slugs.length, slugs };
  },
);
