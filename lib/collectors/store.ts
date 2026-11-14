/**
 * Store what a collector found. Jobs and scripts only (uses getDb()).
 *
 * Opportunities are upserted on (source label, externalId), so running a
 * collector again updates its rows instead of adding copies. Tags and
 * embeddings already on a row are kept: A14 owns those, unless the collector
 * brings its own tags. The source's row in source_status is updated too.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { opportunities, sourceStatus } from "../db/schema";
import { toInstant } from "./swedish-time";
import type { CollectResult, Collector, CollectedOpportunity } from "./types";

export type StoredCollection = { source: string; state: CollectResult["state"]; items: number; inserted: number; updated: number };

function toRow(collector: Collector, item: CollectedOpportunity, result: CollectResult, now: Date) {
  return {
    kind: item.kind,
    source: collector.label,
    externalId: item.externalId,
    title: item.title,
    url: item.url,
    description: item.description ?? null,
    publishedAt: toInstant(item.publishedAt),
    opensAt: toInstant(item.opensAt),
    deadline: toInstant(item.deadline, true),
    eventDate: toInstant(item.eventDate),
    format: item.format ?? null,
    audience: item.audience ?? null,
    eligibilityText: item.eligibilityText ?? null,
    contact: item.contact ?? null,
    verified: item.verified ?? null,
    ...(item.tags ? { tags: item.tags } : {}),
    retrievedAt: result.cachedAt ? new Date(result.cachedAt) : now,
    simulated: result.state === "simulated",
  };
}

export async function storeCollected(collector: Collector, result: CollectResult): Promise<StoredCollection> {
  const now = new Date();
  const db = getDb();
  let inserted = 0;

  await db.transaction(async (tx) => {
    for (const item of result.items) {
      const row = toRow(collector, item, result, now);
      const [saved] = await tx
        .insert(opportunities)
        .values(row)
        .onConflictDoUpdate({
          target: [opportunities.source, opportunities.externalId],
          set: {
            ...row,
            // New text makes the old embedding wrong: clear it, and the enrich job (A14) builds it again.
            embedding: sql`case when ${opportunities.title} is distinct from excluded.title or ${opportunities.description} is distinct from excluded.description then null else ${opportunities.embedding} end`,
            updatedAt: now,
          },
        })
        // xmax is 0 only for a row this statement inserted.
        .returning({ inserted: sql<boolean>`xmax = 0` });
      if (saved.inserted) inserted++;
    }

    const status = {
      label: collector.label,
      state: result.state,
      lastAttemptAt: now,
      ...(result.state === "cached" ? {} : { lastSuccessAt: now }),
      cachedAt: result.cachedAt ? new Date(result.cachedAt) : null,
      itemCount: result.items.length,
      message: result.message ?? null,
    };
    await tx
      .insert(sourceStatus)
      .values({ source: collector.source, ...status })
      .onConflictDoUpdate({ target: sourceStatus.source, set: { ...status, updatedAt: now } });
  });

  return { source: collector.source, state: result.state, items: result.items.length, inserted, updated: result.items.length - inserted };
}
