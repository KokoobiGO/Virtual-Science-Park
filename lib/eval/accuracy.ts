/**
 * Profile accuracy against the team's hand-check (A21). Reads the gold files
 * in data/gold-profiles/ (A7), not the database, so the numbers are tied to
 * what the team actually checked.
 *
 * Stated, inferred and missing claims are counted apart. accuracy = right /
 * checked, and null (not 0, not 1) while nothing in the group is checked.
 */
import { GOLD_DIR, readGoldFiles, type GoldClaim, type GoldFile, type GoldStatus } from "./gold-file";
import { percent, ratio, textTable, type EvalResult } from "./result";

export type AccuracyGroup = {
  claims: number;
  checked: number;
  right: number;
  wrong: number;
  unchecked: number;
  accuracy: number | null;
};

export type AccuracyBlock = Record<GoldStatus | "all", AccuracyGroup>;

export type CompanyAccuracy = AccuracyBlock & {
  slug: string;
  company: string;
  checkedBy: string;
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

export type WrongClaim = { slug: string; claimId: string; field: string; status: GoldStatus; value: GoldClaim["value"]; note: string };

export type AccuracyDetails = { wrong: WrongClaim[] };

export function groupAccuracy(claims: GoldClaim[]): AccuracyGroup {
  const checked = claims.filter((c) => c.verdict !== null).length;
  const right = claims.filter((c) => c.verdict === "right").length;
  return { claims: claims.length, checked, right, wrong: checked - right, unchecked: claims.length - checked, accuracy: ratio(right, checked) };
}

function block(claims: GoldClaim[]): AccuracyBlock {
  const of = (status: GoldStatus) => groupAccuracy(claims.filter((c) => c.status === status));
  return { stated: of("stated"), inferred: of("inferred"), missing: of("missing"), all: groupAccuracy(claims) };
}

export function scoreAccuracy(files: GoldFile[]): EvalResult<AccuracySummary, AccuracyDetails> {
  const companies = files.map((file): CompanyAccuracy => {
    const scores = block(file.claims);
    return {
      slug: file.slug,
      company: file.company,
      checkedBy: file.checkedBy,
      exportedAt: file.exportedAt,
      complete: file.claims.length > 0 && scores.all.unchecked === 0,
      ...scores,
    };
  });
  const wrong = files.flatMap((file) =>
    file.claims
      .filter((c) => c.verdict === "wrong")
      .map((c) => ({ slug: file.slug, claimId: c.claimId, field: c.field, status: c.status, value: c.value, note: c.note })),
  );
  return {
    kind: "profile_accuracy",
    summary: {
      complete: companies.length > 0 && companies.every((c) => c.complete),
      total: block(files.flatMap((file) => file.claims)),
      companies,
    },
    details: { wrong },
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

export function accuracyTable({ summary, details }: EvalResult<AccuracySummary, AccuracyDetails>): string[] {
  const { total } = summary;
  const rows = [
    ["company", "stated", "inferred", "missing", "all", "unchecked"],
    ...[...summary.companies.map((c): { name: string; scores: AccuracyBlock } => ({ name: c.slug, scores: c })), { name: "total", scores: total }].map(({ name, scores }) => [
      name,
      cell(scores.stated),
      cell(scores.inferred),
      cell(scores.missing),
      cell(scores.all),
      String(scores.all.unchecked),
    ]),
  ];
  const lines = [
    `Cells: right/checked of claims = accuracy ("-": nothing checked yet). ${total.all.checked} of ${total.all.claims} claims checked; complete: ${summary.complete ? "yes" : "no"}.`,
    ...textTable(rows),
  ];
  for (const w of details.wrong) {
    lines.push(`wrong: ${w.slug} ${w.field} (${w.status}) ${JSON.stringify(w.value)}${w.note ? `: ${w.note}` : ""}`);
  }
  return lines;
}
