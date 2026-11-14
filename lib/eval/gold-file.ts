/**
 * The gold profiles (A7): the public profiler claims of the three hand-checked
 * members, one file each in data/gold-profiles/<slug>.json. Every claim is
 * marked "right", "wrong" or "unsure" against the company's own pages; the
 * accuracy eval (A21) reads the files.
 *
 * Who checked is part of the file: checkedBy and checkedOn, and, when the
 * verdicts come from an automated reviewer (AI) rather than a person,
 * automatedReviewer true and confirmedByTeam false until a team member has
 * gone through them. The Trust report says so next to the numbers.
 *
 * Exporting again must not lose that work: a claim whose id, value and
 * status are unchanged keeps its verdict, note and checked pages
 * (mergeGoldFile). The files are written with a fixed key order, two-space
 * indent and a trailing newline, so git diffs stay readable.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db";
import { claims, companies, evidence } from "../db/schema";
import { ProfileField } from "../schemas";

export const GOLD_DIR = path.join("data", "gold-profiles");

export const GOLD_HOW_TO =
  'Check each claim against the company\'s own public pages and set verdict to "right", "wrong" or "unsure" (for a missing claim, "right" means the pages really do not say it; "unsure" means the pages do not settle it, and it never counts as right); write why in note, the pages you read in checkedUrls, your name in checkedBy and the day in checkedOn.';

/** "unsure": the pages do not settle it. It counts as checked, never as right. */
export const Verdict = z.enum(["right", "wrong", "unsure"]);
export type Verdict = z.infer<typeof Verdict>;

export const GoldStatus = z.enum(["stated", "inferred", "missing"]);
export type GoldStatus = z.infer<typeof GoldStatus>;

/** Strict: a key the team adds by hand is an error, not something the next export silently drops. */
export const GoldClaim = z.strictObject({
  claimId: z.uuid(),
  field: ProfileField,
  status: GoldStatus,
  value: z.union([z.string(), z.array(z.string())]).nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.strictObject({ quote: z.string(), url: z.string() })),
  /** Null until someone has checked the claim. */
  verdict: Verdict.nullable(),
  note: z.string(),
  /** The pages the verdict was checked against. */
  checkedUrls: z.array(z.string()).optional(),
  /** The verdict the claim had before its value or status changed. */
  previousVerdict: Verdict.optional(),
});
export type GoldClaim = z.infer<typeof GoldClaim>;

export const GoldFile = z.strictObject({
  slug: z.string().min(1),
  company: z.string(),
  exportedAt: z.string(),
  checkedBy: z.string(),
  /** The day the verdicts were given, "YYYY-MM-DD". */
  checkedOn: z.iso.date().optional(),
  /** True when the verdicts come from an automated reviewer (AI), not from a person. */
  automatedReviewer: z.boolean().optional(),
  /** False until a team member has gone through an automated reviewer's verdicts. */
  confirmedByTeam: z.boolean().optional(),
  howTo: z.string(),
  claims: z.array(GoldClaim),
});
export type GoldFile = z.infer<typeof GoldFile>;

/** Who checked a file: what a new export takes over from the file on disk. */
type Review = Pick<GoldFile, "checkedBy" | "checkedOn" | "automatedReviewer" | "confirmedByTeam">;

function reviewOf(file: GoldFile): Review {
  const review: Review = { checkedBy: file.checkedBy };
  if (file.checkedOn !== undefined) review.checkedOn = file.checkedOn;
  if (file.automatedReviewer !== undefined) review.automatedReviewer = file.automatedReviewer;
  if (file.confirmedByTeam !== undefined) review.confirmedByTeam = file.confirmedByTeam;
  return review;
}

/** One active public profiler claim as the database holds it. */
export type ExportClaim = {
  id: string;
  field: ProfileField;
  status: string;
  value: string | string[] | null;
  confidence: number;
  evidence: { quote: string; url: string }[];
};

export type GoldCompany = { slug: string; name: string; claims: ExportClaim[] };

/**
 * The gold members with every ACTIVE, PUBLIC claim the profiler wrote. Never a
 * private claim and never one the member wrote: those are not the profiler's
 * work, and private ones must not end up in the repo.
 */
export async function loadGoldCompanies(db: Db): Promise<GoldCompany[]> {
  const gold = await db
    .select({ id: companies.id, slug: companies.slug, name: companies.name })
    .from(companies)
    .where(eq(companies.isGold, true))
    .orderBy(companies.slug);
  if (!gold.length) return [];

  const rows = await db
    .select({ companyId: claims.companyId, id: claims.id, field: claims.field, status: claims.status, value: claims.value, confidence: claims.confidence })
    .from(claims)
    .where(
      and(
        inArray(claims.companyId, gold.map((c) => c.id)),
        eq(claims.reviewState, "active"),
        eq(claims.visibility, "public"),
        eq(claims.updatedBy, "profiler"),
      ),
    );
  const quotes = rows.length
    ? await db
        .select({ claimId: evidence.claimId, quote: evidence.quote, url: evidence.url })
        .from(evidence)
        .where(inArray(evidence.claimId, rows.map((r) => r.id)))
    : [];

  return gold.map((company) => ({
    slug: company.slug,
    name: company.name,
    claims: rows
      .filter((r) => r.companyId === company.id)
      .map((r) => ({
        id: r.id,
        field: r.field,
        status: r.status,
        value: r.value,
        confidence: r.confidence,
        evidence: quotes.filter((q) => q.claimId === r.id).map((q) => ({ quote: q.quote, url: q.url })),
      })),
  }));
}

const fieldOrder = (field: ProfileField) => ProfileField.options.indexOf(field);
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A new file for one company: claims in profile-field order, every verdict still open. */
export function freshGoldFile(company: GoldCompany, exportedAt: string): GoldFile {
  const goldClaims = [...company.claims]
    .sort((a, b) => fieldOrder(a.field) - fieldOrder(b.field) || compareText(a.id, b.id))
    .map((claim): GoldClaim => {
      const status = GoldStatus.safeParse(claim.status);
      if (!status.success) throw new Error(`${company.slug}: claim ${claim.id} has status "${claim.status}"; a profiler claim is stated, inferred or missing.`);
      return {
        claimId: claim.id,
        field: claim.field,
        status: status.data,
        value: claim.value,
        confidence: claim.confidence,
        // The database keeps no order for quotes: sort them so a new export does not reorder the file.
        evidence: [...claim.evidence].sort((a, b) => compareText(a.url, b.url) || compareText(a.quote, b.quote)),
        verdict: null,
        note: "",
      };
    });
  return { slug: company.slug, company: company.name, exportedAt, checkedBy: "", howTo: GOLD_HOW_TO, claims: goldClaims };
}

export type GoldMerge = {
  file: GoldFile;
  /** False when the file on disk already says exactly this. */
  changed: boolean;
  /** Same id, value and status: verdict, note and checked pages carried over. */
  kept: GoldClaim[];
  /** Same id, but the value or status changed: verdict open again, the old one in previousVerdict. */
  reset: GoldClaim[];
  /** New claim ids. */
  added: GoldClaim[];
  /** Claims in the old file that are no longer active, with whatever verdict they had. */
  dropped: GoldClaim[];
};

const sameClaim = (a: GoldClaim, b: GoldClaim) => a.status === b.status && JSON.stringify(a.value) === JSON.stringify(b.value);

/** The fresh export with the verdicts, notes and reviewer taken over from the file already on disk. */
export function mergeGoldFile(previous: GoldFile | null, fresh: GoldFile): GoldMerge {
  if (!previous) return { file: fresh, changed: true, kept: [], reset: [], added: fresh.claims, dropped: [] };

  const before = new Map(previous.claims.map((claim) => [claim.claimId, claim]));
  const kept: GoldClaim[] = [];
  const reset: GoldClaim[] = [];
  const added: GoldClaim[] = [];

  const merged = fresh.claims.map((claim): GoldClaim => {
    const old = before.get(claim.claimId);
    if (!old) {
      added.push(claim);
      return claim;
    }
    const checkedUrls = old.checkedUrls ? { checkedUrls: old.checkedUrls } : {};
    if (sameClaim(old, claim)) {
      const next = { ...claim, verdict: old.verdict, note: old.note, ...checkedUrls, ...(old.previousVerdict ? { previousVerdict: old.previousVerdict } : {}) };
      kept.push(next);
      return next;
    }
    // The note and its pages stay: they may say what was wrong with the old value.
    const previousVerdict = old.verdict ?? old.previousVerdict;
    const next = { ...claim, verdict: null, note: old.note, ...checkedUrls, ...(previousVerdict ? { previousVerdict } : {}) };
    reset.push(next);
    return next;
  });
  const freshIds = new Set(fresh.claims.map((claim) => claim.claimId));
  const dropped = previous.claims.filter((claim) => !freshIds.has(claim.claimId));

  const file: GoldFile = { ...fresh, ...reviewOf(previous), claims: merged };
  // Nothing changed: keep the old export date too, so the file stays byte for byte the same.
  const unchanged = formatGoldFile({ ...file, exportedAt: previous.exportedAt }) === formatGoldFile(previous);
  return { file: unchanged ? { ...file, exportedAt: previous.exportedAt } : file, changed: !unchanged, kept, reset, added, dropped };
}

/** The file's text: fixed key order, two-space indent, trailing newline. */
export function formatGoldFile(file: GoldFile): string {
  const ordered = {
    slug: file.slug,
    company: file.company,
    exportedAt: file.exportedAt,
    ...reviewOf(file),
    howTo: file.howTo,
    claims: file.claims.map((claim) => ({
      claimId: claim.claimId,
      field: claim.field,
      status: claim.status,
      value: claim.value,
      confidence: claim.confidence,
      evidence: claim.evidence.map((e) => ({ quote: e.quote, url: e.url })),
      verdict: claim.verdict,
      note: claim.note,
      ...(claim.checkedUrls ? { checkedUrls: claim.checkedUrls } : {}),
      ...(claim.previousVerdict ? { previousVerdict: claim.previousVerdict } : {}),
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Parses one file's text; the error names the file and what is wrong in it. */
export function parseGoldFile(text: string, name: string): GoldFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = GoldFile.safeParse(json);
  if (!parsed.success) throw new Error(`${name} does not have the gold-profile shape:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

/** The file at this path, or null when there is none yet. */
export function readGoldFile(filePath: string): GoldFile | null {
  if (!existsSync(filePath)) return null;
  return parseGoldFile(readFileSync(filePath, "utf8"), filePath);
}

/** Every gold file in the folder, sorted by name. Each file's slug must match its name. */
export function readGoldFiles(dir: string = GOLD_DIR): GoldFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const filePath = path.join(dir, name);
      const file = parseGoldFile(readFileSync(filePath, "utf8"), filePath);
      if (`${file.slug}.json` !== name) throw new Error(`${filePath} holds the slug "${file.slug}"; the file must be named ${file.slug}.json.`);
      return file;
    });
}
