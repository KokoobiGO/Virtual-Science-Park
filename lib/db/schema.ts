/**
 * Database tables (S6). Column names are snake_case in Postgres and camelCase
 * here; the mapping comes from `casing: "snake_case"` in drizzle.config.ts and
 * lib/db/index.ts.
 *
 * Enum values come from lib/schemas.ts, so the database and the Zod contract
 * cannot drift apart.
 *
 * Row-level security is not declared here. It lives in a hand-written
 * migration (drizzle/0002_rls.sql) so every policy can be read in one place.
 * Rule of thumb: anything a member enters is private to their company; BSP's
 * public pages and the opportunity store are readable by every signed-in user.
 */
import { sql, type AnyColumn } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import {
  ClaimAuthor,
  ClaimStatus,
  ELIGIBILITY_VALUES,
  MatchMode,
  OpportunityFormat,
  OpportunityKind,
  ProfileField,
  QuoteLang,
  ScopeLabel,
  SourceState,
  Visibility,
  type ScoreBreakdown,
} from "../schemas";

/** voyage-4 returns 1024-dimension vectors. */
export const EMBEDDING_DIMENSIONS = 1024;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** A Zod enum's options as the non-empty tuple pgEnum expects. */
function values<T extends string>(zodEnum: { options: readonly T[] }): [T, ...T[]] {
  return zodEnum.options as [T, ...T[]];
}

export const claimStatus = pgEnum("claim_status", values(ClaimStatus));
export const claimAuthor = pgEnum("claim_author", values(ClaimAuthor));
export const visibility = pgEnum("visibility", values(Visibility));
export const profileField = pgEnum("profile_field", values(ProfileField));
export const claimReviewState = pgEnum("claim_review_state", [
  "active", // shown on the profile
  "suggested", // found by a re-crawl, waiting for the member to accept
  "rejected", // the member said no
  "superseded", // replaced by a newer claim
]);
export const quoteLang = pgEnum("quote_lang", values(QuoteLang));
export const opportunityKind = pgEnum("opportunity_kind", values(OpportunityKind));
export const opportunityFormat = pgEnum("opportunity_format", values(OpportunityFormat));
export const matchMode = pgEnum("match_mode", values(MatchMode));
export const eligibility = pgEnum("eligibility", ELIGIBILITY_VALUES);
/** `saved` lives in its own table, so feedback is only these two. */
export const feedbackKind = pgEnum("feedback_kind", ["useful", "not_relevant"]);
export const chatRole = pgEnum("chat_role", ["user", "assistant"]);
export const scopeLabel = pgEnum("scope_label", values(ScopeLabel));
export const briefStatus = pgEnum("brief_status", ["running", "done", "failed"]);
export const handoffStatus = pgEnum("handoff_status", ["open", "closed"]);
export const sourceState = pgEnum("source_state", values(SourceState));
export const jobStatus = pgEnum("job_status", ["running", "succeeded", "failed"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const timestamptz = () => timestamp({ withTimezone: true });
const createdAt = () => timestamptz().notNull().defaultNow();
const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const textArray = () => text().array().notNull().default(sql`'{}'::text[]`);
/** Auth user id. Not a foreign key: auth.users belongs to Supabase, not to our migrations. */
const authUserId = () => uuid().notNull();
const inUnitRange = (name: string, column: AnyColumn) => check(name, sql`${column} between 0 and 1`);

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

/** Public facts about a BSP member, from the member page. Readable by every signed-in user. */
export const companies = pgTable("companies", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  website: text(),
  /** True when the member page has no website link. */
  websiteMissing: boolean().notNull().default(false),
  memberPage: text().notNull(),
  bspDescription: text(),
  industry: text(),
  employees: text(),
  foundedYear: integer(),
  town: text(),
  /** One of the three hand-checked demo members. */
  isGold: boolean().notNull().default(false),
  /** Built from public claims only, for the public ranking. */
  publicEmbedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
  lastProfiledAt: timestamptz(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** What a member enters about themselves. Readable only by that company. */
export const companyPrivate = pgTable("company_private", {
  companyId: uuid()
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  userPriorities: textArray(),
  /** Built from all claims and priorities, for the personal ranking. */
  personalEmbedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Snapshots, claims and evidence
// ---------------------------------------------------------------------------

/** Clean text of a fetched page. Quotes are checked against this exact text. */
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    /** Where it came from, e.g. "bsp_member", "company_site", "vinnova". */
    source: text().notNull(),
    url: text().notNull(),
    title: text(),
    contentText: text().notNull(),
    contentHash: text().notNull(),
    lang: quoteLang(),
    httpStatus: integer(),
    retrievedAt: timestamptz().notNull().defaultNow(),
    simulated: boolean().notNull().default(false),
  },
  (t) => [index("snapshots_url_retrieved_idx").on(t.url, t.retrievedAt)],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    field: profileField().notNull(),
    /** A string or a list of strings, in English. Null when missing. */
    value: jsonb().$type<string | string[] | null>(),
    status: claimStatus().notNull(),
    confidence: real().notNull(),
    updatedBy: claimAuthor().notNull(),
    visibility: visibility().notNull().default("public"),
    reviewState: claimReviewState().notNull().default("active"),
    /** The claim this one would replace, for suggested updates. */
    supersedesId: uuid().references((): AnyPgColumn => claims.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("claims_company_field_idx").on(t.companyId, t.field),
    inUnitRange("claims_confidence_range", t.confidence),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid().primaryKey().defaultRandom(),
    claimId: uuid()
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    snapshotId: uuid()
      .notNull()
      .references(() => snapshots.id, { onDelete: "restrict" }),
    url: text().notNull(),
    quote: text().notNull(),
    quoteLang: quoteLang().notNull(),
    retrievedAt: timestamptz().notNull(),
    /** When the quote check found the quote in the snapshot. */
    quoteCheckedAt: timestamptz(),
  },
  (t) => [index("evidence_claim_idx").on(t.claimId)],
);

// ---------------------------------------------------------------------------
// Opportunities and matches
// ---------------------------------------------------------------------------

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: opportunityKind().notNull(),
    /** Display name, e.g. "Vinnova". */
    source: text().notNull(),
    /** Stable id from the source (or its URL), so collectors can upsert. */
    externalId: text().notNull(),
    title: text().notNull(),
    url: text().notNull(),
    description: text(),
    publishedAt: timestamptz(),
    opensAt: timestamptz(),
    deadline: timestamptz(),
    eventDate: timestamptz(),
    format: opportunityFormat(),
    audience: text(),
    eligibilityText: text(),
    contact: text(),
    verified: boolean(),
    tags: textArray(),
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
    snapshotId: uuid().references(() => snapshots.id, { onDelete: "set null" }),
    retrievedAt: timestamptz().notNull(),
    simulated: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("opportunities_source_external_id_key").on(t.source, t.externalId),
    index("opportunities_deadline_idx").on(t.deadline),
    index("opportunities_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    mode: matchMode().notNull(),
    score: real().notNull(),
    scoreBreakdown: jsonb().$type<ScoreBreakdown>().notNull(),
    matchedOn: textArray(),
    rank: integer(),
    /** Filled by the judge (A16); empty until then. */
    why: text(),
    nextStep: text(),
    uncertainties: textArray(),
    eligibility: eligibility().notNull().default("potential_match"),
    /** The judge may reject a retrieved match but never invent one. */
    rejected: boolean().notNull().default(false),
    rejectionReason: text(),
    computedAt: timestamptz().notNull().defaultNow(),
    judgedAt: timestamptz(),
  },
  (t) => [
    unique("matches_company_opportunity_mode_key").on(t.companyId, t.opportunityId, t.mode),
    index("matches_company_mode_rank_idx").on(t.companyId, t.mode, t.rank),
    inUnitRange("matches_score_range", t.score),
  ],
);

// ---------------------------------------------------------------------------
// Member activity (all private to the company)
// ---------------------------------------------------------------------------

export const feedback = pgTable(
  "feedback",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: authUserId(),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    kind: feedbackKind().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("feedback_company_opportunity_user_key").on(t.companyId, t.opportunityId, t.userId)],
);

export const savedItems = pgTable(
  "saved_items",
  {
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    userId: authUserId(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.opportunityId] })],
);

/** One row per chat turn. Never readable by staff or by another company. */
export const chats = pgTable(
  "chats",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: authUserId(),
    threadId: uuid().notNull(),
    role: chatRole().notNull(),
    content: text().notNull(),
    scopeLabel: scopeLabel(),
    citations: jsonb().$type<{ url: string; title?: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("chats_company_thread_idx").on(t.companyId, t.threadId, t.createdAt)],
);

/** Scout research briefs. */
export const briefs = pgTable(
  "briefs",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: authUserId(),
    question: text().notNull(),
    status: briefStatus().notNull().default("running"),
    brief: jsonb(),
    searchCount: integer().notNull().default(0),
    /** Pre-run for the demo (B15); opens instantly in cached mode. */
    prerun: boolean().notNull().default(false),
    error: text(),
    createdAt: createdAt(),
    completedAt: timestamptz(),
  },
  (t) => [index("briefs_company_created_idx").on(t.companyId, t.createdAt)],
);

/** Questions passed to BSP staff by the Copilot's contactStaff tool. */
export const handoffs = pgTable("handoffs", {
  id: uuid().primaryKey().defaultRandom(),
  companyId: uuid()
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: authUserId(),
  topic: text().notNull(),
  message: text().notNull(),
  contactRoute: text().notNull(),
  status: handoffStatus().notNull().default("open"),
  context: jsonb(),
  createdAt: createdAt(),
  closedAt: timestamptz(),
});

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** One row per data source, shown on the data status panel. */
export const sourceStatus = pgTable("source_status", {
  source: text().primaryKey(),
  label: text().notNull(),
  state: sourceState().notNull(),
  lastSuccessAt: timestamptz(),
  lastAttemptAt: timestamptz(),
  /** For cached sources: the date the cached copy was taken. */
  cachedAt: timestamptz(),
  itemCount: integer(),
  message: text(),
  updatedAt: updatedAt(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    job: text().notNull(),
    trigger: text(),
    status: jobStatus().notNull().default("running"),
    startedAt: timestamptz().notNull().defaultNow(),
    finishedAt: timestamptz(),
    inputTokens: integer(),
    outputTokens: integer(),
    costUsd: numeric({ precision: 10, scale: 4 }),
    stats: jsonb(),
    error: text(),
  },
  (t) => [index("job_runs_job_started_idx").on(t.job, t.startedAt)],
);

/** Results of `npm run eval`, read by the Trust report. */
export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** E.g. "profile_accuracy", "quote_check", "link_check", "red_team", "privacy". */
    kind: text().notNull(),
    gitSha: text(),
    summary: jsonb().notNull(),
    details: jsonb(),
    ranAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index("eval_runs_kind_ran_idx").on(t.kind, t.ranAt)],
);
