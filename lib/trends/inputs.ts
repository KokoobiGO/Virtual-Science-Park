/**
 * What a trend note (A27) is built from: for one technology area, the
 * opportunities that are new or newly relevant this week.
 *
 * - New: first stored in the last 7 days. A news item is new when it was
 *   published in the last 14 days (stored in the last 7 days when it has no
 *   publish date): an old article the collector only picked up now is not
 *   news of this week.
 * - Left out: the old samples (`externalId` "fixture-..."), hand-entered rows
 *   (`simulated`) and funding whose deadline has passed.
 * - Order: news first, newest first; then the rest by nearest deadline (no
 *   deadline last). At most 8. An area with fewer than 2 gets no note.
 *
 * `selectInputs` is pure, so the rules are tested on fake rows;
 * `loadCandidates` only narrows the table down for it.
 */
import { and, arrayContains, eq, gte, isNotNull, like, not, or } from "drizzle-orm";
import { getDb } from "../db";
import { opportunities } from "../db/schema";
import type { OpportunityKind, OpportunityTag } from "../schemas";

export const MAX_INPUTS = 8;
export const MIN_INPUTS = 2;
/** Days an opportunity counts as new after it was first stored. */
export const NEW_DAYS = 7;
/** Days a news item counts as new after it was published. */
export const NEWS_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The opportunity fields the trend analyst reads. */
export type TrendCandidate = {
  id: string;
  kind: OpportunityKind;
  source: string;
  externalId: string;
  title: string;
  url: string;
  description: string | null;
  tags: string[];
  deadline: Date | null;
  opensAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  simulated: boolean;
};

const isFixture = (row: TrendCandidate) => row.externalId.startsWith("fixture-");

/** New this week, by the rules above. */
export function isNew(row: TrendCandidate, now: Date): boolean {
  const since = (days: number) => now.getTime() - days * DAY_MS;
  if (row.kind === "news" && row.publishedAt) return row.publishedAt.getTime() >= since(NEWS_DAYS);
  return row.createdAt.getTime() >= since(NEW_DAYS);
}

const expired = (row: TrendCandidate, now: Date) => row.kind === "funding" && row.deadline !== null && row.deadline.getTime() < now.getTime();

/** News first (newest first), then by nearest deadline (none last), then by title so the order never wobbles. */
function compareInputs(a: TrendCandidate, b: TrendCandidate): number {
  const aNews = a.kind === "news";
  const bNews = b.kind === "news";
  if (aNews !== bNews) return aNews ? -1 : 1;
  if (aNews) {
    const byDate = (b.publishedAt ?? b.createdAt).getTime() - (a.publishedAt ?? a.createdAt).getTime();
    if (byDate) return byDate;
  } else {
    const byDeadline = (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity);
    if (byDeadline) return byDeadline;
  }
  return a.title.localeCompare(b.title);
}

/** The inputs for one area's note, in prompt order: at most MAX_INPUTS, possibly fewer than MIN_INPUTS. */
export function selectInputs(rows: TrendCandidate[], area: OpportunityTag, now: Date): TrendCandidate[] {
  return rows
    .filter((row) => row.tags.includes(area) && !isFixture(row) && !row.simulated && !expired(row, now) && isNew(row, now))
    .sort(compareInputs)
    .slice(0, MAX_INPUTS);
}

/** The rows of one area that could be new this week. `selectInputs` applies the rules exactly. */
export async function loadCandidates(area: OpportunityTag, now: Date): Promise<TrendCandidate[]> {
  const newSince = new Date(now.getTime() - NEW_DAYS * DAY_MS);
  const newsSince = new Date(now.getTime() - NEWS_DAYS * DAY_MS);
  return getDb()
    .select({
      id: opportunities.id,
      kind: opportunities.kind,
      source: opportunities.source,
      externalId: opportunities.externalId,
      title: opportunities.title,
      url: opportunities.url,
      description: opportunities.description,
      tags: opportunities.tags,
      deadline: opportunities.deadline,
      opensAt: opportunities.opensAt,
      publishedAt: opportunities.publishedAt,
      createdAt: opportunities.createdAt,
      simulated: opportunities.simulated,
    })
    .from(opportunities)
    .where(
      and(
        arrayContains(opportunities.tags, [area]),
        eq(opportunities.simulated, false),
        not(like(opportunities.externalId, "fixture-%")),
        or(gte(opportunities.createdAt, newSince), and(eq(opportunities.kind, "news"), isNotNull(opportunities.publishedAt), gte(opportunities.publishedAt, newsSince))),
      ),
    );
}

/** The inputs for one area this week, from the database. */
export async function inputsForArea(area: OpportunityTag, now: Date): Promise<TrendCandidate[]> {
  return selectInputs(await loadCandidates(area, now), area, now);
}
