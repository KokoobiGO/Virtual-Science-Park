/**
 * The texts we embed (A14). Pure functions, so what goes into each vector can
 * be tested without a database or a model.
 *
 * - opportunityText: title and description.
 * - publicProfileText: what anyone may see about a company. It feeds the
 *   public embedding and the company tags, so it never contains a private claim.
 * - personalProfileText: everything the company itself sees, private claims
 *   and priorities included. It feeds the personal embedding only.
 */
import type { claims } from "../db/schema";
import { ProfileField, type ClaimAuthor, type ClaimStatus, type Visibility } from "../schemas";

/** Long call texts say what they are about early; the rest costs tokens for little. */
export const MAX_DESCRIPTION_CHARS = 2000;

export type OpportunityForText = { title: string; description: string | null };

export type CompanyForText = { name: string; industry: string | null; bspDescription: string | null };

/** A claim row as the text builders need it. */
export type ClaimForText = {
  field: ProfileField;
  value: string | string[] | null;
  status: ClaimStatus;
  visibility: Visibility;
  reviewState: (typeof claims.$inferSelect)["reviewState"];
  updatedBy: ClaimAuthor;
  updatedAt: Date;
};

export const FIELD_LABELS: Record<ProfileField, string> = {
  summary: "Summary",
  offerings: "Offerings",
  technologies: "Technologies",
  applicationAreas: "Application areas",
  markets: "Markets",
  geography: "Geography",
  statedPriorities: "Stated priorities",
  inferredInterests: "Interests",
};

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** Cut to at most `max` characters, at a word boundary where there is one. */
export function cutText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return (/\s/.test(cut) ? cut.replace(/\s+\S*$/, "") : cut).trimEnd();
}

export function opportunityText(o: OpportunityForText): string {
  const description = o.description ? cutText(collapse(o.description), MAX_DESCRIPTION_CHARS) : "";
  return [collapse(o.title), description].filter(Boolean).join("\n");
}

function valueText(value: ClaimForText["value"]): string {
  if (value === null) return "";
  if (typeof value === "string") return collapse(value);
  return value.map(collapse).filter(Boolean).join(", ");
}

/**
 * The claim in charge of each field: active claims only, the member's own
 * claim over the profiler's, then the newest.
 */
function claimsInCharge(all: ClaimForText[]): Map<ProfileField, ClaimForText> {
  const rank = (c: ClaimForText) => (c.updatedBy === "user" ? 1 : 0);
  const winners = new Map<ProfileField, ClaimForText>();
  for (const claim of all) {
    if (claim.reviewState !== "active") continue;
    const current = winners.get(claim.field);
    if (!current || rank(claim) > rank(current) || (rank(claim) === rank(current) && claim.updatedAt > current.updatedAt)) {
      winners.set(claim.field, claim);
    }
  }
  return winners;
}

/**
 * "Label: value" lines in profile order. With `publicOnly`, a field whose
 * claim in charge is private is left out entirely: the member's private answer
 * also hides the profiler's older public one.
 */
function profileLines(all: ClaimForText[], { publicOnly }: { publicOnly: boolean }): string[] {
  const winners = claimsInCharge(all);
  return ProfileField.options.flatMap((field) => {
    const claim = winners.get(field);
    if (!claim || claim.status === "missing") return [];
    if (publicOnly && claim.visibility !== "public") return [];
    const value = valueText(claim.value);
    return value ? [`${FIELD_LABELS[field]}: ${value}`] : [];
  });
}

function companyText(company: CompanyForText, lines: string[], extra: string[] = []): string {
  const fallback = !lines.length && company.bspDescription ? cutText(collapse(company.bspDescription), MAX_DESCRIPTION_CHARS) : "";
  return [
    collapse(company.name),
    company.industry ? `Industry: ${collapse(company.industry)}` : "",
    ...lines,
    fallback ? `Description: ${fallback}` : "",
    ...extra,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Name, industry and the active public claims. BSP's description when there are none. */
export function publicProfileText(company: CompanyForText, all: ClaimForText[]): string {
  return companyText(company, profileLines(all, { publicOnly: true }));
}

/** Like the public text, but over all active claims, private ones too, plus the member's priorities. */
export function personalProfileText(company: CompanyForText, all: ClaimForText[], userPriorities: readonly string[]): string {
  const priorities = userPriorities.map(collapse).filter(Boolean);
  return companyText(company, profileLines(all, { publicOnly: false }), priorities.length ? [`Priorities: ${priorities.join(", ")}`] : []);
}
