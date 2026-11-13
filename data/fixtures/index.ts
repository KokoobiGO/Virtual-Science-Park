/**
 * Hand-written fixtures (S9): three gold members, 15 opportunities and their
 * matches, so screens can be built before real data arrives.
 *
 * Everything here is SIMULATED. Snapshot texts are written by the team, not
 * fetched, and every row the seed writes carries `simulated = true` so the UI
 * labels it. Replace with real pipeline output as A6 and A9 land.
 *
 * `loadFixtures()` checks the files against the shared schemas in
 * lib/schemas.ts, so a fixture that breaks the contract fails the unit tests.
 */
import { z } from "zod";
import {
  ClaimAuthor,
  ClaimStatus,
  CompanyProfile,
  ListClaim,
  Opportunity,
  OpportunityFormat,
  OpportunityKind,
  OpportunityTag,
  ProfileField,
  QuoteLang,
  ScoreBreakdown,
  TextClaim,
  UserPriority,
  Visibility,
  type Claim,
} from "../../lib/schemas";
import companiesJson from "./companies.json";
import matchesJson from "./matches.json";
import opportunitiesJson from "./opportunities.json";

/** All fixture rows claim to have been retrieved at this moment. */
export const FIXTURE_RETRIEVED_AT = "2026-11-13T09:00:00+01:00";

const FixtureSnapshot = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  url: z.url(),
  lang: QuoteLang,
  text: z.string().startsWith("[FIXTURE]"),
});

const FixtureClaim = z.object({
  field: ProfileField,
  value: z.union([z.string(), z.array(z.string()), z.null()]),
  status: ClaimStatus,
  confidence: z.number().min(0).max(1),
  updatedBy: ClaimAuthor.default("profiler"),
  visibility: Visibility.default("public"),
  reviewState: z.enum(["active", "suggested", "rejected", "superseded"]).default("active"),
  evidence: z.array(z.object({ snapshot: z.string(), quote: z.string().min(1) })),
});

const FixtureCompany = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  website: z.url().nullable(),
  memberPage: z.url(),
  industry: z.string().optional(),
  isGold: z.boolean(),
  userPriorities: z.array(UserPriority),
  snapshots: z.array(FixtureSnapshot).min(1),
  claims: z.array(FixtureClaim).min(1),
});

const FixtureOpportunity = z.object({
  externalId: z.string().startsWith("fixture-"),
  kind: OpportunityKind,
  source: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  description: z.string().optional(),
  publishedAt: z.iso.date().optional(),
  opensAt: z.iso.date().optional(),
  deadline: z.iso.date().optional(),
  eventDate: z.iso.date().optional(),
  format: OpportunityFormat.optional(),
  verified: z.boolean().optional(),
  tags: z.array(OpportunityTag),
});

const FixtureMatch = z.object({
  company: z.string(),
  opportunity: z.string(),
  breakdown: ScoreBreakdown,
  matchedOn: z.array(z.string()),
  why: z.string().min(1),
  nextStep: z.string().min(1),
  uncertainties: z.array(z.string()),
});

export type FixtureCompany = z.infer<typeof FixtureCompany>;
export type FixtureClaim = z.infer<typeof FixtureClaim>;
export type FixtureOpportunity = z.infer<typeof FixtureOpportunity>;
export type FixtureMatch = z.infer<typeof FixtureMatch>;

export type Fixtures = {
  companies: FixtureCompany[];
  opportunities: FixtureOpportunity[];
  matches: FixtureMatch[];
};

/** A stand-in id for contract checks; the seed uses real database ids. */
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

/** Turn a fixture claim into a contract Claim, so the shared schema can check it. */
export function toContractClaim(company: FixtureCompany, claim: FixtureClaim): Claim<string | string[]> {
  const snapshots = new Map(company.snapshots.map((s) => [s.key, s]));
  return {
    value: claim.value,
    status: claim.status,
    confidence: claim.confidence,
    updatedBy: claim.updatedBy,
    visibility: claim.visibility,
    evidence: claim.evidence.map((e) => {
      const snapshot = snapshots.get(e.snapshot);
      if (!snapshot) throw new Error(`${company.slug}: unknown snapshot "${e.snapshot}"`);
      return {
        url: snapshot.url,
        quote: e.quote,
        quoteLang: snapshot.lang,
        snapshotId: PLACEHOLDER_ID,
        retrievedAt: FIXTURE_RETRIEVED_AT,
      };
    }),
  };
}

/** Load the fixture files and check them against the shared contract. Throws on the first problem. */
export function loadFixtures(): Fixtures {
  const companies = z.array(FixtureCompany).parse(companiesJson);
  const opportunities = z.array(FixtureOpportunity).parse(opportunitiesJson);
  const matches = z.array(FixtureMatch).parse(matchesJson);

  for (const company of companies) {
    const snapshots = new Map(company.snapshots.map((s) => [s.key, s.text]));
    for (const claim of company.claims) {
      for (const e of claim.evidence) {
        if (!snapshots.get(e.snapshot)?.includes(e.quote)) {
          throw new Error(`${company.slug}.${claim.field}: quote not found in snapshot "${e.snapshot}": ${e.quote}`);
        }
      }
    }

    // Build the profile from the active claims and parse it with the contract.
    const active = company.claims.filter((c) => c.reviewState === "active");
    const byField = new Map<string, Claim<string | string[]>>();
    for (const claim of active) {
      if (byField.has(claim.field)) throw new Error(`${company.slug}: two active claims for ${claim.field}`);
      byField.set(claim.field, toContractClaim(company, claim));
    }
    for (const field of ProfileField.options) {
      if (!byField.has(field)) throw new Error(`${company.slug}: no active claim for ${field}`);
      (field === "summary" ? TextClaim : ListClaim).parse(byField.get(field));
    }
    CompanyProfile.parse({
      id: PLACEHOLDER_ID,
      name: company.name,
      website: company.website,
      memberPage: company.memberPage,
      ...Object.fromEntries(byField),
      userPriorities: company.userPriorities,
      lastProfiledAt: FIXTURE_RETRIEVED_AT,
    });
  }

  for (const o of opportunities) {
    Opportunity.parse({
      ...o,
      id: PLACEHOLDER_ID,
      retrievedAt: FIXTURE_RETRIEVED_AT,
      simulated: true,
    });
  }

  const slugs = new Set(companies.map((c) => c.slug));
  const externalIds = new Set(opportunities.map((o) => o.externalId));
  if (externalIds.size !== opportunities.length) throw new Error("Duplicate opportunity externalId in fixtures.");
  const pairs = new Set<string>();
  for (const m of matches) {
    if (!slugs.has(m.company)) throw new Error(`Match for unknown company "${m.company}"`);
    if (!externalIds.has(m.opportunity)) throw new Error(`Match for unknown opportunity "${m.opportunity}"`);
    const pair = `${m.company}/${m.opportunity}`;
    if (pairs.has(pair)) throw new Error(`Duplicate match ${pair}`);
    pairs.add(pair);
  }

  return { companies, opportunities, matches };
}
