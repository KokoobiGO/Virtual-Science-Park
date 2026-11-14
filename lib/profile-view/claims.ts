/**
 * The company profile screen (C5): which claim each field shows, and the
 * badge, confidence and stale flag that go with it. Pure functions, so the
 * rules can be tested without a database.
 *
 * The claim in charge of a field is the same one the embeddings use
 * (lib/embeddings/text.ts): active claims only, the member's own over the
 * profiler's, then the newest. A field without one is shown as missing, never
 * hidden.
 */
import type { claims } from "../db/schema";
import { isStale } from "../profiler/stale";
import { ProfileField, type ClaimAuthor, type ClaimStatus, type ProfileStatus, type QuoteLang, type Visibility } from "../schemas";

export type ReviewState = (typeof claims.$inferSelect)["reviewState"];

/** A claim row as the profile screen needs it. */
export type ClaimRow = {
  id: string;
  field: ProfileField;
  value: string | string[] | null;
  status: ClaimStatus;
  confidence: number;
  visibility: Visibility;
  reviewState: ReviewState;
  updatedBy: ClaimAuthor;
  supersedesId: string | null;
  updatedAt: Date;
};

export const FIELD_TEXT: Record<ProfileField, { label: string; hint: string }> = {
  summary: { label: "Summary", hint: "What the company does, in one or two sentences." },
  offerings: { label: "Products and services", hint: "What the company sells or delivers." },
  technologies: { label: "Technologies", hint: "Technical skills and technologies it works with." },
  applicationAreas: { label: "Application areas", hint: "Where its products are used." },
  markets: { label: "Markets", hint: "Industries and customer groups." },
  geography: { label: "Geography", hint: "Where it works and sells." },
  statedPriorities: { label: "Projects and priorities", hint: "Projects and collaborations the pages mention." },
  inferredInterests: { label: "Likely interests", hint: "Our reading of the pages. It stays inferred until the member confirms it." },
};

/** The Badge variants the status badges use (components/ui/badge). */
export type BadgeVariant = "default" | "secondary" | "outline";

export const STATUS_BADGE: Record<ClaimStatus, { label: string; variant: BadgeVariant; hint: string }> = {
  stated: { label: "Stated", variant: "default", hint: "Said on the company's own pages; the quote is the evidence." },
  inferred: { label: "Inferred", variant: "secondary", hint: "Read between the lines of the pages, not said in so many words." },
  missing: { label: "Missing", variant: "outline", hint: "The public pages do not say this." },
  user_confirmed: { label: "Confirmed by member", variant: "secondary", hint: "The member confirmed this value." },
  user_corrected: { label: "Corrected by member", variant: "secondary", hint: "The member wrote this value." },
};

export type ConfidenceLevel = "low" | "med" | "high";

/** 0 to 1 as low / med / high. */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "med";
  return "low";
}

/** Confidence only means something for what the profiler read off a page. */
const showsConfidence = (status: ClaimStatus) => status === "stated" || status === "inferred";

export type FieldView = {
  field: ProfileField;
  label: string;
  hint: string;
  /** The claim shown. Null when the field has no visible active claim; it is then shown as missing. */
  claim: ClaimRow | null;
  status: ClaimStatus;
  /** Null for missing claims and for the member's own values. */
  confidence: ConfidenceLevel | null;
  stale: boolean;
  /** The newest open suggestion from the weekly profile refresh, if any. */
  suggestion: ClaimRow | null;
};

const authorRank = (c: ClaimRow) => (c.updatedBy === "user" ? 1 : 0);

const newer = (a: ClaimRow, b: ClaimRow) => a.updatedAt.getTime() > b.updatedAt.getTime();

/** The active claim in charge of each field: the member's own over the profiler's, then the newest. */
export function claimsInCharge(rows: readonly ClaimRow[]): Map<ProfileField, ClaimRow> {
  const winners = new Map<ProfileField, ClaimRow>();
  for (const row of rows) {
    if (row.reviewState !== "active") continue;
    const current = winners.get(row.field);
    if (!current || authorRank(row) > authorRank(current) || (authorRank(row) === authorRank(current) && newer(row, current))) {
      winners.set(row.field, row);
    }
  }
  return winners;
}

export type ProfileViewOptions = {
  now?: Date;
  /** The public view: private claims are never shown, and there are no suggestions. */
  publicOnly?: boolean;
};

/** One entry per profile field, in display order. */
export function profileView(rows: readonly ClaimRow[], { now = new Date(), publicOnly = false }: ProfileViewOptions = {}): FieldView[] {
  const visible = publicOnly ? rows.filter((r) => r.visibility === "public") : rows;
  const winners = claimsInCharge(visible);

  return ProfileField.options.map((field) => {
    const claim = winners.get(field) ?? null;
    const status: ClaimStatus = claim?.status ?? "missing";
    const suggestion = publicOnly
      ? null
      : (visible
          .filter((r) => r.field === field && r.reviewState === "suggested")
          .reduce<ClaimRow | null>((best, r) => (!best || newer(r, best) ? r : best), null));
    return {
      field,
      ...FIELD_TEXT[field],
      claim,
      status,
      confidence: claim && showsConfidence(status) ? confidenceLevel(claim.confidence) : null,
      stale: claim ? isStale(claim.updatedAt, now) : false,
      suggestion,
    };
  });
}

/** A claim value as list items: one for a summary, none when missing. */
export function valueItems(value: string | string[] | null): string[] {
  if (value === null) return [];
  return (typeof value === "string" ? [value] : value).map((v) => v.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** How the company's last profiling run went (A8); "none" when it was never profiled. */
export const PROFILE_STATUS_TEXT: Record<ProfileStatus | "none", string> = {
  profiled: "Profiled",
  thin: "Thin profile: too little public info",
  failed: "Profiling failed",
  none: "Not profiled yet",
};

export const QUOTE_LANG_TEXT: Record<QuoteLang, string> = {
  sv: "Swedish",
  en: "English",
  other: "Original language",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Stockholm" });

/** "14 Nov 2026", Swedish time. */
export function formatDate(date: Date): string {
  return DATE_FORMAT.format(date);
}
