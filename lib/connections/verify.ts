/**
 * Checks on the judge's answer (A28), in code, after the model has answered.
 * A pair that fails a check is dropped, never repaired: what is stored is
 * exactly what the model wrote, resting only on claims it was shown.
 *
 * - The judge said plausible.
 * - At least one cited claim from each company.
 * - Every cited id was shown, and belongs to the company it is cited for.
 * - The basis is 20 to 400 characters.
 * - The basis has none of the interest words: staff must never read that
 *   either company wants the contact.
 * - 1 to 4 labels, each short.
 */
import { MAX_LABELS, type JudgeAnswer } from "./judge";
import type { ShownClaim, Side } from "./prompt";

export const MIN_BASIS_CHARS = 20;
export const MAX_BASIS_CHARS = 400;
export const MAX_LABEL_CHARS = 40;

/**
 * Words and phrases that say or suggest a company wants something, has asked
 * for something or has agreed to something. Matched as whole words, ignoring
 * case. The basis describes what each company does, never what it wants.
 */
export const INTEREST_WORDS = [
  "interest",
  "interests",
  "interested",
  "want",
  "wants",
  "wanted",
  "would like",
  "looking for",
  "looks for",
  "seeking",
  "seeks",
  "seek",
  "has expressed",
  "have expressed",
  "expressed interest",
  "agreed",
  "agrees",
  "keen",
  "eager",
  "open to",
  "willing",
  "would welcome",
  "reach out",
  "reached out",
  "in talks",
  "in discussions",
] as const;

/** A cited claim, as stored in connections.evidence. */
export type ConnectionEvidence = { companyId: string; claimId: string; field: string; value: string };

export type VerifiedConnection = { basis: string; sharedOn: string[]; evidence: ConnectionEvidence[] };

export type VerifyCheck = "plausible" | "sides" | "ids" | "basis_length" | "interest_words" | "labels";

export type VerifyResult = { ok: true; connection: VerifiedConnection } | { ok: false; check: VerifyCheck; reason: string };

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const INTEREST_PATTERN = new RegExp(`\\b(?:${INTEREST_WORDS.map((w) => escapeRegExp(w).replace(/ /g, "\\s+")).join("|")})\\b`, "i");

/** The interest words in a text, as written there. */
export function interestWordsIn(text: string): string[] {
  const global = new RegExp(INTEREST_PATTERN.source, "gi");
  return [...new Set([...text.matchAll(global)].map((m) => m[0].toLowerCase()))];
}

/**
 * `pair` is the two company ids: a cited claim must have been shown for its
 * side and belong to that side's company.
 */
export function verifyJudgement(answer: JudgeAnswer, shown: readonly ShownClaim[], pair: { companyAId: string; companyBId: string }): VerifyResult {
  const fail = (check: VerifyCheck, reason: string): VerifyResult => ({ ok: false, check, reason });
  if (!answer.plausible) return fail("plausible", `the judge said no: ${collapse(answer.basis).slice(0, 200)}`);

  const cited = { A: [...new Set(answer.claimsA.map((id) => id.trim().toUpperCase()))], B: [...new Set(answer.claimsB.map((id) => id.trim().toUpperCase()))] };
  if (!cited.A.length || !cited.B.length) return fail("sides", `no claim cited for ${!cited.A.length ? "A" : "B"}`);

  const byId = new Map(shown.map((c) => [c.shortId, c]));
  const companyOf: Record<Side, string> = { A: pair.companyAId, B: pair.companyBId };
  for (const side of ["A", "B"] as Side[]) {
    for (const id of cited[side]) {
      const claim = byId.get(id);
      if (!claim) return fail("ids", `${id} was not shown`);
      if (claim.side !== side) return fail("ids", `${id} is a claim of ${claim.side}, cited for ${side}`);
      if (claim.claim.companyId !== companyOf[side]) return fail("ids", `${id} belongs to another company than ${side}`);
    }
  }

  const basis = collapse(answer.basis);
  if (basis.length < MIN_BASIS_CHARS || basis.length > MAX_BASIS_CHARS) {
    return fail("basis_length", `the basis is ${basis.length} characters, not ${MIN_BASIS_CHARS} to ${MAX_BASIS_CHARS}`);
  }
  const interest = interestWordsIn(basis);
  if (interest.length) return fail("interest_words", `the basis says ${interest.map((w) => `"${w}"`).join(", ")}`);

  const sharedOn = [...new Set(answer.sharedOn.map(collapse).filter(Boolean))];
  if (!sharedOn.length || sharedOn.length > MAX_LABELS) return fail("labels", `${sharedOn.length} labels, not 1 to ${MAX_LABELS}`);
  const long = sharedOn.find((label) => label.length > MAX_LABEL_CHARS);
  if (long) return fail("labels", `the label "${long.slice(0, 60)}" is longer than ${MAX_LABEL_CHARS} characters`);

  const citedIds = new Set([...cited.A, ...cited.B]);
  const evidence = shown
    .filter((c) => citedIds.has(c.shortId))
    .map((c) => ({ companyId: c.claim.companyId, claimId: c.claim.id, field: c.claim.field, value: c.claim.value }));
  return { ok: true, connection: { basis, sharedOn, evidence } };
}
