/**
 * The data status of a brief's store citations (D20). A run records it in
 * each citation (agent.ts, toScoutOption). Briefs written before that carry
 * none, so when one is read the status is filled in from the cited store row
 * as it is now. Pure, so it is unit-tested; queries.ts does the reading.
 */
import type { SourceState } from "../schemas";
import type { ScoutBrief } from "./types";

export type CitationStatus = { simulated: boolean; sourceState: SourceState | null; sourceCachedAt: string | null };

/** Opportunity ids of the store citations that have no data status yet. */
export function idsWithoutStatus(brief: Pick<ScoutBrief, "options">): string[] {
  return [
    ...new Set(
      brief.options.flatMap((o) => (o.citation.origin === "store" && o.opportunityId && o.citation.simulated === undefined ? [o.opportunityId] : [])),
    ),
  ];
}

/** The brief with the status filled in where a citation has none and the store row was found. Citations that have one keep it. */
export function withCitationStatus<T extends Pick<ScoutBrief, "options">>(brief: T, byId: ReadonlyMap<string, CitationStatus>): T {
  return {
    ...brief,
    options: brief.options.map((option) => {
      const status = option.opportunityId && option.citation.simulated === undefined ? byId.get(option.opportunityId) : undefined;
      return status ? { ...option, citation: { ...option.citation, ...status } } : option;
    }),
  };
}
