/**
 * "Ask BSP" on a Your-week card (C4): a question to BSP staff about one
 * opportunity, stored in `handoffs` for the member's company.
 *
 * Request paths only: pass the signed-in member's transaction from
 * withUserDb(). The policy handoffs_member_insert (drizzle/0002_rls.sql) lets
 * a member insert a handoff for its own company with its own user id; staff
 * read it (handoffs_read).
 *
 * Only public facts about the opportunity go into the handoff, never the
 * card's "why", which can rest on the company's private profile data.
 *
 * Asking again while the company's question about the same opportunity is
 * still open does not add a second row.
 */
import { and, eq } from "drizzle-orm";
import { companies, handoffs, opportunities } from "../db/schema";
import type { UserTx } from "../db/user";
import type { OpportunityKind } from "../schemas";
import { formatWhen, kindLabel } from "./format";
import { handoffOpportunityId } from "./load";

/** `handoffs.contact_route` for questions sent from a card. The Copilot's handoff sets its own. */
export const WEEK_CARD_CONTACT_ROUTE = "your_week";

export type HandoffOpportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  url: string;
  source: string;
  deadline: Date | null;
  eventDate: Date | null;
};

/** `handoffs.context` for a question sent from a card. */
export type WeekCardHandoffContext = {
  from: "your_week";
  opportunityId: string;
  kind: OpportunityKind;
  title: string;
  source: string;
  url: string;
};

export type HandoffDraft = { topic: string; message: string; contactRoute: string; context: WeekCardHandoffContext };

const TOPIC_MAX = 160;

/** The handoff row's text, from public facts only. */
export function draftHandoff(opportunity: HandoffOpportunity, companyName: string): HandoffDraft {
  const topic = `Your week: ${opportunity.title}`;
  const dates = [
    opportunity.deadline ? `Deadline: ${formatWhen(opportunity.deadline)}.` : null,
    opportunity.eventDate ? `Event date: ${formatWhen(opportunity.eventDate)}.` : null,
  ].filter((line): line is string => line !== null);
  const message = [
    `${companyName} would like to talk to BSP staff about this potential match from their Your week list.`,
    `${kindLabel(opportunity.kind)} from ${opportunity.source}: ${opportunity.title}`,
    ...dates,
    `Source: ${opportunity.url}`,
  ].join("\n");
  return {
    topic: topic.length > TOPIC_MAX ? `${topic.slice(0, TOPIC_MAX - 3).trimEnd()}...` : topic,
    message,
    contactRoute: WEEK_CARD_CONTACT_ROUTE,
    context: {
      from: "your_week",
      opportunityId: opportunity.id,
      kind: opportunity.kind,
      title: opportunity.title,
      source: opportunity.source,
      url: opportunity.url,
    },
  };
}

export type AskBspResult = { handoffId: string; created: boolean };

/**
 * Sends the company's question about one opportunity to BSP staff. Returns
 * the open handoff (the existing one when the company already asked), or
 * null when there is no such opportunity.
 */
export async function askBspAboutOpportunity(
  tx: UserTx,
  { companyId, userId, opportunityId }: { companyId: string; userId: string; opportunityId: string },
): Promise<AskBspResult | null> {
  const [opportunity] = await tx
    .select({
      id: opportunities.id,
      kind: opportunities.kind,
      title: opportunities.title,
      url: opportunities.url,
      source: opportunities.source,
      deadline: opportunities.deadline,
      eventDate: opportunities.eventDate,
    })
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);
  if (!opportunity) return null;

  const [open] = await tx
    .select({ id: handoffs.id })
    .from(handoffs)
    .where(and(eq(handoffs.companyId, companyId), eq(handoffs.status, "open"), eq(handoffOpportunityId, opportunityId)))
    .limit(1);
  if (open) return { handoffId: open.id, created: false };

  const [company] = await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
  const draft = draftHandoff(opportunity, company?.name ?? "A member company");
  const [row] = await tx
    .insert(handoffs)
    .values({ companyId, userId, ...draft })
    .returning({ id: handoffs.id });
  return { handoffId: row.id, created: true };
}
