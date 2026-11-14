/**
 * What follows a re-rank (A18, C8). Rows that newly entered a company's top 20
 * have no judge text yet, and the "Your week" cards are built from judged
 * rows, so:
 *
 *   ranked rows the judge has not seen  ->  app/company.judge.requested { slug, cards: true }
 *                                           (the judge job asks for the cards when it is done)
 *   nothing to judge                    ->  app/cards.requested { slugs }
 *
 * Pure, so the plan is unit-tested; the match job sends it.
 */

export type FollowUp = {
  /** Companies the judge goes through first; their cards follow from the judge job. */
  judge: string[];
  /** Companies whose cards are built straight away. */
  cards: string[];
};

/** Splits the re-ranked companies by whether they have ranked rows still to judge (`pending`). */
export function planFollowUp(slugs: readonly string[], pending: readonly string[]): FollowUp {
  const toJudge = new Set(pending);
  const unique = [...new Set(slugs)];
  return { judge: unique.filter((s) => toJudge.has(s)), cards: unique.filter((s) => !toJudge.has(s)) };
}

export type FollowUpEvent =
  | { name: "app/company.judge.requested"; data: { slug: string; cards: true } }
  | { name: "app/cards.requested"; data: { slugs: string[] } };

/** The events for a plan: one judge run per company, one cards build for the rest. */
export function followUpEvents({ judge, cards }: FollowUp): FollowUpEvent[] {
  return [
    ...judge.map((slug): FollowUpEvent => ({ name: "app/company.judge.requested", data: { slug, cards: true } })),
    ...(cards.length ? [{ name: "app/cards.requested", data: { slugs: [...cards] } } satisfies FollowUpEvent] : []),
  ];
}
