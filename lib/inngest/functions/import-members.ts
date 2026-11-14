/**
 * Member list import (A2): reads BSP's member list and every member page into
 * the companies table. Run it by sending the event:
 *
 *   await inngest.send({ name: "app/members.import.requested", data: {} })
 *
 * Members are imported in batches, one step each, so no step comes near
 * Netlify's 60 s limit and a failed batch is retried on its own.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobRuns, sourceStatus } from "@/lib/db/schema";
import { importMembers, listMembers } from "@/lib/members/import";
import { inngest } from "../client";

const BATCH_SIZE = 14;

export type MemberImportResult = {
  total: number;
  imported: number;
  /** Slugs of members whose page has no website link. */
  websiteMissing: string[];
  failed: { slug: string; error: string }[];
};

export const importMembersJob = inngest.createFunction(
  { id: "import-members", name: "Import the BSP member list", retries: 2, triggers: [{ event: "app/members.import.requested" }] },
  async ({ event, step }): Promise<MemberImportResult> => {
    const runId = await step.run("record start", async () => {
      const [row] = await getDb().insert(jobRuns).values({ job: "import-members", trigger: event.name }).returning({ id: jobRuns.id });
      return row.id;
    });

    const members = await step.run("list members", listMembers);

    const result: MemberImportResult = { total: members.length, imported: 0, websiteMissing: [], failed: [] };
    for (let start = 0; start < members.length; start += BATCH_SIZE) {
      const batch = await step.run(`import members ${start + 1}-${Math.min(start + BATCH_SIZE, members.length)}`, () =>
        importMembers(members.slice(start, start + BATCH_SIZE)),
      );
      for (const member of batch) {
        if ("error" in member) result.failed.push(member);
        else {
          result.imported++;
          if (!member.website) result.websiteMissing.push(member.slug);
        }
      }
    }

    await step.run("record finish", async () => {
      const db = getDb();
      const now = new Date();
      const ok = result.failed.length === 0;
      await db
        .update(jobRuns)
        .set({ status: ok ? "succeeded" : "failed", finishedAt: now, stats: result, error: ok ? null : `${result.failed.length} members failed` })
        .where(eq(jobRuns.id, runId));
      const status = {
        label: "BSP member list",
        state: "live" as const,
        lastAttemptAt: now,
        ...(result.imported ? { lastSuccessAt: now, itemCount: result.imported } : {}),
        message: ok ? null : `${result.failed.length} of ${result.total} member pages failed`,
      };
      await db
        .insert(sourceStatus)
        .values({ source: "bsp_members", ...status })
        .onConflictDoUpdate({ target: sourceStatus.source, set: { ...status, updatedAt: now } });
    });

    return result;
  },
);
