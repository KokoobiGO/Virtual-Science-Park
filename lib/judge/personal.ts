/**
 * Public and personal judgements (A16). Pure, so the rule is unit-tested.
 *
 * Public-mode rows are judged from the public profile text only, because staff
 * can read them. A company with no private data (no active private claim and
 * no priority switched on) has a personal text equal to its public one, so its
 * personal row for an opportunity gets a copy of the public judgement instead
 * of a second model call. A company with private data has its personal rows
 * judged separately, from the personal text.
 */
import type { Judgement } from "./verify";

export function hasPrivateData({ privateActiveClaims, priorities }: { privateActiveClaims: number; priorities: readonly string[] }): boolean {
  return privateActiveClaims > 0 || priorities.length > 0;
}

export type CopiedJudgement = { matchId: string; opportunityId: string; judgement: Judgement };

/**
 * Which personal rows copy a public judgement and which need the model. A row
 * whose opportunity has no public judgement (not judged yet, or failed) is
 * judged by the model, from the personal text.
 */
export function planPersonal<R extends { matchId: string; opportunityId: string }>({
  privateData,
  rows,
  publicJudgements,
}: {
  privateData: boolean;
  rows: readonly R[];
  /** By opportunity id. */
  publicJudgements: ReadonlyMap<string, Judgement>;
}): { copies: CopiedJudgement[]; toJudge: R[] } {
  if (privateData) return { copies: [], toJudge: [...rows] };
  const copies: CopiedJudgement[] = [];
  const toJudge: R[] = [];
  for (const row of rows) {
    const judgement = publicJudgements.get(row.opportunityId);
    if (judgement) copies.push({ matchId: row.matchId, opportunityId: row.opportunityId, judgement: { ...judgement, uncertainties: [...judgement.uncertainties] } });
    else toJudge.push(row);
  }
  return { copies, toJudge };
}
