/**
 * Reads for the profile screens (C5, C6), on the signed-in user's own
 * database client (withUserDb), so row-level security decides every row:
 * a member reads its own private claims and priorities, everyone else only
 * public claims. The page text behind each quote is read here and cut to a
 * short excerpt; the whole snapshot never reaches the browser.
 */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { claims, companies, companyPrivate, evidence, snapshots } from "../db/schema";
import type { UserTx } from "../db/user";
import { UserPriority, type ProfileStatus, type QuoteLang } from "../schemas";
import type { ClaimRow } from "./claims";
import { quoteInContext, type QuoteInContext } from "./evidence";

export type CompanyHeader = {
  id: string;
  slug: string;
  name: string;
  website: string | null;
  websiteMissing: boolean;
  memberPage: string;
  industry: string | null;
  town: string | null;
  profileStatus: ProfileStatus | null;
  profileNote: string | null;
  lastProfiledAt: Date | null;
};

export type EvidenceView = {
  id: string;
  /** Word for word, in the page's own language. */
  quote: string;
  quoteLang: QuoteLang;
  url: string;
  retrievedAt: Date;
  /** The page text was written by the team, not fetched. */
  simulated: boolean;
  /** The quote with some page text around it; null when the page text could not be read or does not hold the quote. */
  context: QuoteInContext | null;
};

export type LoadedProfile = {
  company: CompanyHeader;
  rows: ClaimRow[];
  /** Quotes per claim id. */
  evidence: Record<string, EvidenceView[]>;
};

const companyColumns = {
  id: companies.id,
  slug: companies.slug,
  name: companies.name,
  website: companies.website,
  websiteMissing: companies.websiteMissing,
  memberPage: companies.memberPage,
  industry: companies.industry,
  town: companies.town,
  profileStatus: companies.profileStatus,
  profileNote: companies.profileNote,
  lastProfiledAt: companies.lastProfiledAt,
};

const claimColumns = {
  id: claims.id,
  field: claims.field,
  value: claims.value,
  status: claims.status,
  confidence: claims.confidence,
  visibility: claims.visibility,
  reviewState: claims.reviewState,
  updatedBy: claims.updatedBy,
  supersedesId: claims.supersedesId,
  updatedAt: claims.updatedAt,
};

async function evidenceFor(tx: UserTx, claimIds: string[]): Promise<Record<string, EvidenceView[]>> {
  if (!claimIds.length) return {};
  const quotes = await tx
    .select({
      id: evidence.id,
      claimId: evidence.claimId,
      snapshotId: evidence.snapshotId,
      quote: evidence.quote,
      quoteLang: evidence.quoteLang,
      url: evidence.url,
      retrievedAt: evidence.retrievedAt,
    })
    .from(evidence)
    .where(inArray(evidence.claimId, claimIds))
    .orderBy(asc(evidence.retrievedAt), asc(evidence.id));

  const snapshotIds = [...new Set(quotes.map((q) => q.snapshotId))];
  const pages = new Map(
    snapshotIds.length
      ? (
          await tx
            .select({ id: snapshots.id, contentText: snapshots.contentText, simulated: snapshots.simulated })
            .from(snapshots)
            .where(inArray(snapshots.id, snapshotIds))
        ).map((s) => [s.id, s])
      : [],
  );

  const byClaim: Record<string, EvidenceView[]> = {};
  for (const q of quotes) {
    const page = pages.get(q.snapshotId);
    (byClaim[q.claimId] ??= []).push({
      id: q.id,
      quote: q.quote,
      quoteLang: q.quoteLang,
      url: q.url,
      retrievedAt: q.retrievedAt,
      simulated: page?.simulated ?? false,
      context: page ? quoteInContext(page.contentText, q.quote) : null,
    });
  }
  return byClaim;
}

/** A member's own company: active and suggested claims, private ones too, and its priorities. */
export async function loadOwnProfile(
  tx: UserTx,
  companyId: string,
): Promise<(LoadedProfile & { priorities: UserPriority[] }) | null> {
  const [company] = await tx.select(companyColumns).from(companies).where(eq(companies.id, companyId));
  if (!company) return null;
  const rows = await tx
    .select(claimColumns)
    .from(claims)
    .where(and(eq(claims.companyId, companyId), inArray(claims.reviewState, ["active", "suggested"])));
  const [own] = await tx
    .select({ userPriorities: companyPrivate.userPriorities })
    .from(companyPrivate)
    .where(eq(companyPrivate.companyId, companyId));
  const priorities = (own?.userPriorities ?? []).filter((p): p is UserPriority => UserPriority.safeParse(p).success);
  return { company, rows, evidence: await evidenceFor(tx, rows.map((r) => r.id)), priorities };
}

/** Any company's public profile: active public claims only, whoever asks. */
export async function loadPublicProfile(tx: UserTx, slug: string): Promise<LoadedProfile | null> {
  const [company] = await tx.select(companyColumns).from(companies).where(eq(companies.slug, slug));
  if (!company) return null;
  const rows = await tx
    .select(claimColumns)
    .from(claims)
    .where(and(eq(claims.companyId, company.id), eq(claims.reviewState, "active"), eq(claims.visibility, "public")));
  return { company, rows, evidence: await evidenceFor(tx, rows.map((r) => r.id)) };
}

export type CompanyListItem = Pick<CompanyHeader, "slug" | "name" | "industry" | "town" | "profileStatus" | "lastProfiledAt">;

/** Every member company, by name, for the staff list. */
export async function loadCompanyList(tx: UserTx): Promise<CompanyListItem[]> {
  return tx
    .select({
      slug: companies.slug,
      name: companies.name,
      industry: companies.industry,
      town: companies.town,
      profileStatus: companies.profileStatus,
      lastProfiledAt: companies.lastProfiledAt,
    })
    .from(companies)
    .orderBy(asc(companies.name));
}
