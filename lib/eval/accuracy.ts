/**
 * Profile accuracy against the hand-check (A21). Reads the gold files in
 * data/gold-profiles/ (A7), not the database, so the numbers are tied to what
 * was actually checked, and by whom: each company carries its file's
 * checkedBy, checkedOn, automatedReviewer and confirmedByTeam, so the Trust
 * report can say when the verdicts come from an automated reviewer (AI).
 *
 * Stated, inferred and missing claims are counted apart. accuracy = right /
 * checked, and null (not 0, not 1) while nothing in the group is checked. An
 * "unsure" verdict counts as checked and never as right, so it lowers the
 * accuracy; it is counted on its own as well.
 */
import { GOLD_DIR, readGoldFiles, type GoldClaim, type GoldFile, type GoldStatus } from "./gold-file";
import { percent, ratio, textTable, type EvalResult } from "./result";

export type AccuracyGroup = {
  claims: number;
  checked: number;
  right: number;
  wrong: number;
  unsure: number;
  unchecked: number;
  accuracy: number | null;
};

export type AccuracyBlock = Record<GoldStatus | "all", AccuracyGroup>;

export type CompanyAccuracy = AccuracyBlock & {
  slug: string;
  company: string;
  checkedBy: string;
  /** "YYYY-MM-DD", or null when the file does not say. */
  checkedOn: string | null;
  /** The verdicts come from an automated reviewer (AI), not from a person. */
  automatedReviewer: boolean;
  /** A team member has gone through the automated reviewer's verdicts. */
  confirmedByTeam: boolean;
  exportedAt: string;
  /** Every claim in the file has a verdict. */
  complete: boolean;
};

export type AccuracySummary = {
  /** True only when every exported claim of every gold file has a verdict. */
  complete: boolean;
  total: AccuracyBlock;
  companies: CompanyAccuracy[];
};

/** A claim judged wrong or unsure, with why and where it was checked. */
export type FlaggedClaim = {
  slug: string;
  claimId: string;
  field: string;
  status: GoldStatus;
  value: GoldClaim["value"];
  note: string;
  checkedUrls: string[];
};

export type AccuracyDetails = { wrong: FlaggedClaim[]; unsure: FlaggedClaim[] };

export function groupAccuracy(claims: GoldClaim[]): AccuracyGroup {
  const count = (verdict: GoldClaim["verdict"]) => claims.filter((c) => c.verdict === verdict).length;
  const checked = claims.length - count(null);
  const right = count("right");
  return { claims: claims.length, checked, right, wrong: count("wrong"), unsure: count("unsure"), unchecked: count(null), accuracy: ratio(right, checked) };
}

function block(claims: GoldClaim[]): AccuracyBlock {
  const of = (status: GoldStatus) => groupAccuracy(claims.filter((c) => c.status === status));
  return { stated: of("stated"), inferred: of("inferred"), missing: of("missing"), all: groupAccuracy(claims) };
}

function flagged(files: GoldFile[], verdict: "wrong" | "unsure"): FlaggedClaim[] {
  return files.flatMap((file) =>
    file.claims
      .filter((c) => c.verdict === verdict)
      .map((c) => ({ slug: file.slug, claimId: c.claimId, field: c.field, status: c.status, value: c.value, note: c.note, checkedUrls: c.checkedUrls ?? [] })),
  );
}

export function scoreAccuracy(files: GoldFile[]): EvalResult<AccuracySummary, AccuracyDetails> {
  const companies = files.map((file): CompanyAccuracy => {
    const scores = block(file.claims);
    return {
      slug: file.slug,
      company: file.company,
      checkedBy: file.checkedBy,
      checkedOn: file.checkedOn ?? null,
      automatedReviewer: file.automatedReviewer ?? false,
      confirmedByTeam: file.confirmedByTeam ?? false,
      exportedAt: file.exportedAt,
      complete: file.claims.length > 0 && scores.all.unchecked === 0,
      ...scores,
    };
  });
  return {
    kind: "profile_accuracy",
    summary: {
      complete: companies.length > 0 && companies.every((c) => c.complete),
      total: block(files.flatMap((file) => file.claims)),
      companies,
    },
    details: { wrong: flagged(files, "wrong"), unsure: flagged(files, "unsure") },
  };
}

/** The eval: score the gold files on disk. */
export function profileAccuracy(dir: string = GOLD_DIR): EvalResult<AccuracySummary, AccuracyDetails> {
  const files = readGoldFiles(dir);
  if (!files.length) throw new Error(`No gold profiles in ${dir}. Run scripts/gold-export.ts first.`);
  return scoreAccuracy(files);
}

/** "right/checked of claims = accuracy", e.g. "4/5 of 6 = 80%". */
const cell = (g: AccuracyGroup) => `${g.right}/${g.checked} of ${g.claims} = ${percent(g.accuracy)}`;

/** "checked by automated reviewer (AI), not a person on 2026-11-14; not confirmed by a team member". */
export function reviewerText(c: Pick<CompanyAccuracy, "checkedBy" | "checkedOn" | "automatedReviewer" | "confirmedByTeam">): string {
  const by = c.checkedBy ? `checked by ${c.checkedBy}` : "no reviewer named";
  const on = c.checkedOn ? ` on ${c.checkedOn}` : "";
  const confirmed = c.automatedReviewer ? (c.confirmedByTeam ? "; confirmed by a team member" : "; not confirmed by a team member") : "";
  return `${by}${on}${confirmed}`;
}

export function accuracyTable({ summary, details }: EvalResult<AccuracySummary, AccuracyDetails>): string[] {
  const { total } = summary;
  const rows = [
    ["company", "stated", "inferred", "missing", "all", "unsure", "unchecked"],
    ...[...summary.companies.map((c): { name: string; scores: AccuracyBlock } => ({ name: c.slug, scores: c })), { name: "total", scores: total }].map(({ name, scores }) => [
      name,
      cell(scores.stated),
      cell(scores.inferred),
      cell(scores.missing),
      cell(scores.all),
      String(scores.all.unsure),
      String(scores.all.unchecked),
    ]),
  ];
  const lines = [
    `Cells: right/checked of claims = accuracy ("-": nothing checked yet; unsure counts as checked, never as right). ${total.all.checked} of ${total.all.claims} claims checked; complete: ${summary.complete ? "yes" : "no"}.`,
    ...textTable(rows),
    ...summary.companies.map((c) => `reviewer ${c.slug}: ${reviewerText(c)}`),
  ];
  for (const verdict of ["wrong", "unsure"] as const) {
    for (const w of details[verdict]) {
      lines.push(`${verdict}: ${w.slug} ${w.field} (${w.status}) ${JSON.stringify(w.value)}${w.note ? `: ${w.note}` : ""}`);
    }
  }
  return lines;
}
