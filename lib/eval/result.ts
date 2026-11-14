/**
 * What every eval returns (A21), and small helpers for its numbers and its
 * printed table. scripts/eval.ts stores `summary` and `details` as one
 * eval_runs row of `kind`.
 */

export type EvalResult<Summary = unknown, Details = unknown> = {
  kind: string;
  summary: Summary;
  details: Details;
};

/** part / whole, or null when there is nothing to divide by. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** 0.256 as "26%", null as "-". */
export function percent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

/** Rows of cells as padded lines, the first row being the header. */
export function textTable(rows: string[][]): string[] {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => (row[i] ?? "").length)));
  return rows.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join("  "));
}
