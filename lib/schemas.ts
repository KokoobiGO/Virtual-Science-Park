/**
 * Shared schemas: the contract between agents, the database and the UI.
 *
 * Every stream imports its types from here. Agent output is parsed with these
 * schemas before it is stored, and the database enums are built from the same
 * option lists, so a value the schema rejects can never reach a table.
 *
 * Source: "Data model" in the Solution Plan v2. One deliberate change from the
 * plan: `visibility` lives on each Claim rather than once on the profile,
 * because row-level security works row by row and "user-added fields default
 * private" needs a per-field switch.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** An ISO 8601 date (`2026-12-08`) or date-time with offset (`2026-12-08T23:59:00+01:00`). */
export const IsoDate = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const Visibility = z.enum(["public", "private"]);
export type Visibility = z.infer<typeof Visibility>;

// ---------------------------------------------------------------------------
// Claim and Evidence
// ---------------------------------------------------------------------------

export const ClaimStatus = z.enum([
  "stated",
  "inferred",
  "missing",
  "user_confirmed",
  "user_corrected",
]);
export type ClaimStatus = z.infer<typeof ClaimStatus>;

/** Statuses that come from the member, not from a page. They need no evidence. */
export const USER_STATUSES = ["user_confirmed", "user_corrected"] as const satisfies readonly ClaimStatus[];

export const ClaimAuthor = z.enum(["profiler", "user"]);
export type ClaimAuthor = z.infer<typeof ClaimAuthor>;

export const QuoteLang = z.enum(["sv", "en", "other"]);
export type QuoteLang = z.infer<typeof QuoteLang>;

/** The prompt asks for about 25 words; anything past this is not a short quote. */
export const MAX_QUOTE_CHARS = 400;

export const Evidence = z.object({
  url: z.url(),
  /** Word for word, in the page's own language. */
  quote: z.string().trim().min(1).max(MAX_QUOTE_CHARS),
  quoteLang: QuoteLang,
  /** The stored page text the quote was checked against. */
  snapshotId: z.uuid(),
  retrievedAt: z.iso.datetime({ offset: true }),
});
export type Evidence = z.infer<typeof Evidence>;

export type Claim<T> = {
  /** Written in English. Null only when the status is `missing`. */
  value: T | null;
  status: ClaimStatus;
  /** 0 to 1, shown as low / med / high. */
  confidence: number;
  /** Required unless the status is `missing` or one of the user statuses. */
  evidence: Evidence[];
  updatedBy: ClaimAuthor;
  visibility: Visibility;
};

/** Build the schema for a claim whose value has the given shape. */
export function claimSchema<T extends z.ZodType>(value: T) {
  return z
    .object({
      value: value.nullable(),
      status: ClaimStatus,
      confidence: z.number().min(0).max(1),
      evidence: z.array(Evidence),
      updatedBy: ClaimAuthor,
      visibility: Visibility.default("public"),
    })
    .superRefine((claim, ctx) => {
      // TypeScript cannot see `value` through the generic, so read it untyped.
      const claimValue: unknown = (claim as { value?: unknown }).value;
      const fromUser = (USER_STATUSES as readonly string[]).includes(claim.status);
      if (claim.status === "missing" && claimValue !== null) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "A missing claim has no value." });
      }
      if (claim.status !== "missing" && claimValue === null) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "Only a missing claim may have no value." });
      }
      if (!fromUser && claim.status !== "missing" && claim.evidence.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence"],
          message: "Stated and inferred claims need at least one piece of evidence.",
        });
      }
      if (fromUser !== (claim.updatedBy === "user")) {
        ctx.addIssue({
          code: "custom",
          path: ["updatedBy"],
          message: "User statuses are written by the user, and only by the user.",
        });
      }
    });
}

export const TextClaim = claimSchema(z.string().trim().min(1));
export const ListClaim = claimSchema(z.array(z.string().trim().min(1)));

// ---------------------------------------------------------------------------
// CompanyProfile
// ---------------------------------------------------------------------------

/** Profile fields that are stored as claims, in display order. */
export const ProfileField = z.enum([
  "summary",
  "offerings",
  "technologies",
  "applicationAreas",
  "markets",
  "geography",
  "statedPriorities",
  "inferredInterests",
]);
export type ProfileField = z.infer<typeof ProfileField>;

/**
 * How a company's last profiling run went (A8). `thin`: too little public
 * info to support most fields. `failed`: the run itself broke. Null on the
 * company row means it was never profiled.
 */
export const ProfileStatus = z.enum(["profiled", "thin", "failed"]);
export type ProfileStatus = z.infer<typeof ProfileStatus>;

/** What a member can switch on as a priority. Always private. */
export const UserPriority = z.enum(["funding", "testing", "partners", "events", "market"]);
export type UserPriority = z.infer<typeof UserPriority>;

export const CompanyProfile = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1),
    /** Null when the member page has no website link (A2's "missing" flag). */
    website: z.url().nullable(),
    memberPage: z.url(),
    summary: TextClaim,
    /** Products and services. */
    offerings: ListClaim,
    technologies: ListClaim,
    applicationAreas: ListClaim,
    /** Industries and customer groups. */
    markets: ListClaim,
    geography: ListClaim,
    /** Projects and collaborations. */
    statedPriorities: ListClaim,
    /** Always `inferred` until the member confirms it. */
    inferredInterests: ListClaim,
    /** E.g. ["testing", "funding"]. Always private. */
    userPriorities: z.array(UserPriority),
    lastProfiledAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((profile, ctx) => {
    const status = profile.inferredInterests.status;
    if (status === "stated") {
      ctx.addIssue({
        code: "custom",
        path: ["inferredInterests", "status"],
        message: "Inferred interests stay inferred until the member confirms them.",
      });
    }
  });
export type CompanyProfile = z.infer<typeof CompanyProfile>;

// ---------------------------------------------------------------------------
// Opportunity
// ---------------------------------------------------------------------------

export const OpportunityKind = z.enum(["funding", "testbed", "event", "news"]);
export type OpportunityKind = z.infer<typeof OpportunityKind>;

export const OpportunityFormat = z.enum(["online", "in_person", "hybrid"]);
export type OpportunityFormat = z.infer<typeof OpportunityFormat>;

/** Tags the Haiku tagger may assign (A14). Matching uses tag overlap. */
export const OpportunityTag = z.enum(["marine", "defence", "sensor", "cyber", "ai", "energy"]);
export type OpportunityTag = z.infer<typeof OpportunityTag>;

export const Opportunity = z.object({
  id: z.uuid(),
  kind: OpportunityKind,
  title: z.string().trim().min(1),
  url: z.url(),
  /** Display name of where it came from, e.g. "Vinnova". */
  source: z.string().trim().min(1),
  /** Call text or event blurb. Feeds the embedding. */
  description: z.string().optional(),
  publishedAt: IsoDate.optional(),
  opensAt: IsoDate.optional(),
  deadline: IsoDate.optional(),
  eventDate: IsoDate.optional(),
  format: OpportunityFormat.optional(),
  audience: z.string().optional(),
  eligibilityText: z.string().optional(),
  contact: z.string().optional(),
  /** Testbeds only: whether the team has confirmed the testbed exists and takes visitors. */
  verified: z.boolean().optional(),
  tags: z.array(OpportunityTag),
  retrievedAt: z.iso.datetime({ offset: true }),
  /** True for anything hand-written or invented. The UI labels it SIMULATED. */
  simulated: z.boolean(),
});
export type Opportunity = z.infer<typeof Opportunity>;

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

export const MatchMode = z.enum(["personal", "public"]);
export type MatchMode = z.infer<typeof MatchMode>;

export const FeedbackKind = z.enum(["useful", "not_relevant", "saved"]);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

/** The only eligibility value the system may ever state. Eligibility is a human decision. */
export const Eligibility = z.literal("potential_match");
export const ELIGIBILITY_VALUES = ["potential_match"] as const;

/** Starting weights from the plan; tune on demo data. They sum to 1. */
export const SCORE_WEIGHTS = {
  similarity: 0.45,
  tagOverlap: 0.2,
  priorityBoost: 0.15,
  urgency: 0.1,
  feedback: 0.1,
} as const;

const unit = z.number().min(0).max(1);

export const ScoreBreakdown = z.object({
  similarity: unit,
  tagOverlap: unit,
  priorityBoost: unit,
  urgency: unit,
  /** -1 (dismissed similar items) to 1 (saved similar items). */
  feedback: z.number().min(-1).max(1),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

/** The weighted sum the jury can read. */
export function combineScore(b: ScoreBreakdown): number {
  const raw =
    SCORE_WEIGHTS.similarity * b.similarity +
    SCORE_WEIGHTS.tagOverlap * b.tagOverlap +
    SCORE_WEIGHTS.priorityBoost * b.priorityBoost +
    SCORE_WEIGHTS.urgency * b.urgency +
    SCORE_WEIGHTS.feedback * b.feedback;
  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
}

/** Public mode never reads private input, so these two parts are zero there. */
export function toPublicBreakdown(b: ScoreBreakdown): ScoreBreakdown {
  return { ...b, priorityBoost: 0, feedback: 0 };
}

export const Match = z
  .object({
    companyId: z.uuid(),
    opportunityId: z.uuid(),
    score: unit,
    scoreBreakdown: ScoreBreakdown,
    /** Personal uses private fields; public never does. */
    mode: MatchMode,
    /** E.g. ["underwater sensors", "Baltic Sea"], shown as "matched on". */
    matchedOn: z.array(z.string()).default([]),
    why: z.string().trim().min(1),
    nextStep: z.string().trim().min(1),
    uncertainties: z.array(z.string()),
    eligibility: Eligibility,
    feedback: FeedbackKind.optional(),
  })
  .superRefine((match, ctx) => {
    const b = match.scoreBreakdown;
    if (match.mode === "public" && (b.priorityBoost !== 0 || b.feedback !== 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["scoreBreakdown"],
        message: "Public matches must not use private priorities or feedback.",
      });
    }
    if (match.mode === "public" && match.feedback !== undefined) {
      ctx.addIssue({ code: "custom", path: ["feedback"], message: "Feedback is private to the company." });
    }
  });
export type Match = z.infer<typeof Match>;

// ---------------------------------------------------------------------------
// Roles, chat and data status
// ---------------------------------------------------------------------------

export const AppRole = z.enum(["member", "staff"]);
export type AppRole = z.infer<typeof AppRole>;

/** What Supabase Auth carries in `app_metadata`. Users cannot edit it. */
export const AppMetadata = z.discriminatedUnion("role", [
  z.object({ role: z.literal("member"), company_id: z.uuid() }),
  z.object({ role: z.literal("staff") }),
]);
export type AppMetadata = z.infer<typeof AppMetadata>;

/** Labels from the scope classifier (B5), stored on every chat turn. */
export const ScopeLabel = z.enum(["in_scope", "unclear", "out_of_scope", "override_attempt"]);
export type ScopeLabel = z.infer<typeof ScopeLabel>;

/** Per-source data status shown on the data status panel. */
export const SourceState = z.enum(["live", "cached", "simulated"]);
export type SourceState = z.infer<typeof SourceState>;

/** Fixed note the output check adds to Copilot answers (B8). */
export const INFORMATION_ONLY_NOTE =
  "Information only, not a formal eligibility decision. Contact BSP staff to confirm.";
