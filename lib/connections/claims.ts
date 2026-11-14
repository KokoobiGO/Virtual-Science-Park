/**
 * The public claims the connection finder (A28) may read. Every other file in
 * lib/connections gets claims from here and nowhere else.
 *
 * A claim is read when it is the claim in charge of its field (active; the
 * member's own over the profiler's, then the newest), is public, and is not
 * missing. This is the same rule as the public embedding text
 * (lib/embeddings/text.ts): when the member's own claim for a field is
 * private, the profiler's older public claim for that field is not read either.
 *
 * The database query never returns the value of a private claim; the pure
 * filter below checks the visibility again.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { claims } from "../db/schema";
import { ProfileField, type ClaimAuthor, type ClaimStatus, type Visibility } from "../schemas";

/** A public claim, with a list value joined with ", ". */
export type PublicClaim = { id: string; companyId: string; field: ProfileField; value: string };

/** A claim row as the filter needs it. */
export type ClaimRow = {
  id: string;
  companyId: string;
  field: ProfileField;
  value: string | string[] | null;
  status: ClaimStatus;
  visibility: Visibility;
  reviewState: "active" | "suggested" | "rejected" | "superseded";
  updatedBy: ClaimAuthor;
  updatedAt: Date;
};

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** A claim value as one line of text: a list joined with ", ". */
export function claimValueText(value: ClaimRow["value"]): string {
  if (value === null) return "";
  if (typeof value === "string") return collapse(value);
  return value.map(collapse).filter(Boolean).join(", ");
}

/**
 * The public claims among these rows: at most one per company and field, in
 * profile field order. Pure, so the privacy rule can be tested on fake rows.
 */
export function publicClaimsOf(rows: readonly ClaimRow[]): PublicClaim[] {
  const rank = (c: ClaimRow) => (c.updatedBy === "user" ? 1 : 0);
  const inCharge = new Map<string, ClaimRow>();
  for (const row of rows) {
    if (row.reviewState !== "active") continue;
    const key = `${row.companyId}|${row.field}`;
    const current = inCharge.get(key);
    if (!current || rank(row) > rank(current) || (rank(row) === rank(current) && row.updatedAt > current.updatedAt)) {
      inCharge.set(key, row);
    }
  }

  const order = (field: ProfileField) => ProfileField.options.indexOf(field);
  return [...inCharge.values()]
    .flatMap((row): PublicClaim[] => {
      if (row.visibility !== "public" || row.status === "missing") return [];
      const value = claimValueText(row.value);
      return value ? [{ id: row.id, companyId: row.companyId, field: row.field, value }] : [];
    })
    .sort((a, b) => (a.companyId === b.companyId ? order(a.field) - order(b.field) : a.companyId < b.companyId ? -1 : 1));
}

/** The public claims of these companies, by company id. A company without any has an empty list. */
export async function loadPublicClaims(companyIds: readonly string[]): Promise<Map<string, PublicClaim[]>> {
  const byCompany = new Map<string, PublicClaim[]>(companyIds.map((id) => [id, []]));
  if (!companyIds.length) return byCompany;

  const rows = await getDb()
    .select({
      id: claims.id,
      companyId: claims.companyId,
      field: claims.field,
      // Private claims are needed to know which field they hide, but their value never leaves the database.
      value: sql<string | string[] | null>`case when ${claims.visibility} = 'public' then ${claims.value} end`.mapWith(claims.value),
      status: claims.status,
      visibility: claims.visibility,
      reviewState: claims.reviewState,
      updatedBy: claims.updatedBy,
      updatedAt: claims.updatedAt,
    })
    .from(claims)
    .where(and(inArray(claims.companyId, [...companyIds]), eq(claims.reviewState, "active")));

  for (const claim of publicClaimsOf(rows)) byCompany.get(claim.companyId)?.push(claim);
  return byCompany;
}
