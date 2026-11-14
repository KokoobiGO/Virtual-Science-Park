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
import en from "@/messages/en.json";
import type { claims } from "../db/schema";
import { DEFAULT_LOCALE, type Locale } from "../i18n/config";
import { formatDay } from "../i18n/format";
import { MESSAGES } from "../i18n/translate";
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

/** Each field's name and hint, in English (messages/en.json). The screen picks its language with `profileView(..., { locale })` (C19). */
export const FIELD_TEXT: Record<ProfileField, { label: string; hint: string }> = en.profile.fields;

// The status badge itself (word, icon, colour) is components/claim-badge, shared by every screen.

export type ConfidenceLevel = "low" | "med" | "high";

/** The words the screen shows for each level, in English (`profile.confidenceLevels`). */
export const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = en.profile.confidenceLevels;

/** The id of a field's heading on the profile screen, so focus can go back to it. */
export function fieldHeadingId(field: ProfileField): string {
  return `field-${field}`;
}

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
  /** The language of the field names and hints (C19); English when left out. */
  locale?: Locale;
};

/** One entry per profile field, in display order. */
export function profileView(
  rows: readonly ClaimRow[],
  { now = new Date(), publicOnly = false, locale = DEFAULT_LOCALE }: ProfileViewOptions = {},
): FieldView[] {
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
      ...MESSAGES[locale].profile.fields[field],
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

/** How the company's last profiling run went (A8); "none" when it was never profiled. English (`profile.status`). */
export const PROFILE_STATUS_TEXT: Record<ProfileStatus | "none", string> = en.profile.status;

/** The key of a quote's language under `profile.evidence.languages` ("other" is "original": a plural entry has an "other" key). */
export const QUOTE_LANG_KEY = { sv: "sv", en: "en", other: "original" } as const satisfies Record<QuoteLang, string>;

/** The language of a quote, in English (`profile.evidence.languages`). */
export const QUOTE_LANG_TEXT: Record<QuoteLang, string> = {
  sv: en.profile.evidence.languages.sv,
  en: en.profile.evidence.languages.en,
  other: en.profile.evidence.languages.original,
};

/** "14 Nov 2026" ("14 nov. 2026" in Swedish), Swedish time. */
export function formatDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  return formatDay(date, locale);
}
