/**
 * The explorer's reads (C14). Runs as the signed-in user, so row-level
 * security decides what comes back: every signed-in user reads the
 * opportunities, and only a member's own company reads its personal matches.
 */
import "server-only";
import { and, eq, isNotNull, not, like } from "drizzle-orm";
import type { Viewer } from "../auth";
import { matches, opportunities } from "../db/schema";
import { withUserDb } from "../db/user";
import { FIXTURE_PREFIX } from "../matcher/score";
import { personalMatchMap, type ExploreItem, type MatchInfo } from "./filter";

export type ExploreData = {
  items: ExploreItem[];
  /** The member's ranked, kept personal matches by opportunity id. Null for staff. */
  matches: Map<string, MatchInfo> | null;
};

export async function loadExplore(viewer: Viewer): Promise<ExploreData> {
  return withUserDb(viewer.claims, async (tx) => {
    const items = await tx
      .select({
        id: opportunities.id,
        kind: opportunities.kind,
        source: opportunities.source,
        title: opportunities.title,
        url: opportunities.url,
        description: opportunities.description,
        opensAt: opportunities.opensAt,
        deadline: opportunities.deadline,
        eventDate: opportunities.eventDate,
        tags: opportunities.tags,
        simulated: opportunities.simulated,
      })
      .from(opportunities)
      // The old hand-written test fixtures are never shown.
      .where(not(like(opportunities.externalId, `${FIXTURE_PREFIX}%`)));

    if (viewer.role !== "member" || !viewer.companyId) return { items, matches: null };

    const rows = await tx
      .select({ opportunityId: matches.opportunityId, rank: matches.rank, rejected: matches.rejected, why: matches.why })
      .from(matches)
      .where(
        and(
          eq(matches.companyId, viewer.companyId),
          eq(matches.mode, "personal"),
          isNotNull(matches.rank),
          eq(matches.rejected, false),
        ),
      );
    return { items, matches: personalMatchMap(rows) };
  });
}
