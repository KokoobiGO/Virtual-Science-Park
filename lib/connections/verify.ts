/**
 * Checks on the judge's answer (A28), in code, after the model has answered.
 * A pair that fails a check is dropped, never repaired: what is stored is
 * exactly what the model wrote, resting only on claims it was shown.
 *
 * - The judge said plausible, and named how the two fit (not "none").
 * - At least one cited claim from each company.
 * - Every cited id was shown, and belongs to the company it is cited for; a
 *   cited opportunity was shown, and a same-opportunity fit cites one.
 * - What each side brings is a concrete thing, in the words of that side's
 *   cited claims, and not the same thing on both sides: a field ("maritime",
 *   "energy sector") or a broad word ("digitalisation") is not a basis.
 * - The basis is 20 to 400 characters and does not rest on a shared field,
 *   region or filler ("same industry", "both in Blekinge", "synergies").
 * - The first step for BSP staff is 20 to 250 characters.
 * - Neither text has an interest word (staff must never read that either
 *   company wants the contact), an eligibility word or "apply".
 * - 1 to 4 labels, each short.
 */
import { eligibilityClaim } from "../judge/verify";
import { MAX_LABELS, type JudgeAnswer } from "./judge";
import type { FitKind, ShownClaim, ShownOpportunity, Side } from "./prompt";

export const MIN_BASIS_CHARS = 20;
export const MAX_BASIS_CHARS = 400;
export const MIN_FIRST_STEP_CHARS = 20;
export const MAX_FIRST_STEP_CHARS = 250;
export const MAX_BRINGS_CHARS = 90;
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

/**
 * A basis that rests on a shared field, a shared region or filler instead of
 * two things that fit. Seen with the stronger model on 2026-11-14 evening.
 */
export const GENERIC_BASIS_PATTERNS: readonly RegExp[] = [
  /\bsame (?:industry|sector|field|region|market|area|customers?|customer group)\b/i,
  /\bboth\b[^.]{0,80}\b(?:in|from|within) (?:blekinge|karlskrona|the region|the same region|sweden)\b/i,
  /\bboth (?:companies |organisations |organizations )?(?:are|work|operate)(?: active)? in the [a-z]+ (?:sector|industry|field)\b/i,
  /\bsynerg/i,
  /\bleverag/i,
  /\bwell[- ]placed\b/i,
  /\bexplore (?:potential |possible |joint )?(?:collaboration|cooperation|partnership|opportunities|synerg)/i,
  /\bcollaborate on innovation\b/i,
];

/** Telling a company or staff to apply or submit assumes it may. */
const APPLY_PATTERN = /\bappl(?:y|ies|ying)\b|\bapplied for\b|\bsubmit(?:s|ting)?\b/i;

/** Words that carry no concrete thing on their own: a field, a sector or a broad word. */
const GENERIC_WORDS = new Set([
  "digitalisation",
  "digitalization",
  "digital",
  "digitalisering",
  "sustainability",
  "sustainable",
  "innovation",
  "innovations",
  "innovative",
  "solution",
  "solutions",
  "service",
  "services",
  "technology",
  "technologies",
  "tech",
  "products",
  "product",
  "systems",
  "system",
  "maritime",
  "marine",
  "defence",
  "defense",
  "energy",
  "security",
  "sector",
  "industry",
  "industries",
  "field",
  "area",
  "areas",
  "market",
  "markets",
  "business",
  "development",
  "expertise",
  "knowledge",
  "competence",
  "experience",
  "projects",
  "project",
  "consulting",
  "consultancy",
  "public",
  "private",
  "sweden",
  "swedish",
  "blekinge",
  "karlskrona",
  "region",
  "regional",
  "national",
]);

const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "into", "that", "this", "their", "its", "our", "such", "other", "also", "both", "each", "within", "including", "like", "used", "use", "uses"]);

/** A cited claim, as stored in connections.evidence. */
export type ConnectionEvidence = { companyId: string; claimId: string; field: string; value: string };

export type VerifiedConnection = {
  basis: string;
  firstStep: string;
  fit: Exclude<FitKind, "none">;
  aBrings: string;
  bBrings: string;
  /** The cited shared opportunity's title, or null. */
  opportunityTitle: string | null;
  sharedOn: string[];
  evidence: ConnectionEvidence[];
};

export type VerifyCheck =
  | "plausible"
  | "fit"
  | "sides"
  | "ids"
  | "opportunity"
  | "brings"
  | "basis_length"
  | "generic"
  | "first_step"
  | "interest_words"
  | "eligibility"
  | "labels";

export type VerifyResult = { ok: true; connection: VerifiedConnection } | { ok: false; check: VerifyCheck; reason: string };

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const INTEREST_PATTERN = new RegExp(`\\b(?:${INTEREST_WORDS.map((w) => escapeRegExp(w).replace(/ /g, "\\s+")).join("|")})\\b`, "i");

/** The interest words in a text, as written there. */
export function interestWordsIn(text: string): string[] {
  const global = new RegExp(INTEREST_PATTERN.source, "gi");
  return [...new Set([...text.matchAll(global)].map((m) => m[0].toLowerCase()))];
}

/** The first generic phrase in a basis, as written there, or null. */
export function genericPhraseIn(text: string): string | null {
  for (const pattern of GENERIC_BASIS_PATTERNS) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return null;
}

/** The words of a text that can name a thing: no stop words, no generic words, short words only as acronyms ("UV", "AI"). */
export function contentWords(text: string): string[] {
  return [...new Set((text.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? []).flatMap((w) => w.split("-")))].filter((w) => {
    const lower = w.toLowerCase();
    if (STOP_WORDS.has(lower) || GENERIC_WORDS.has(lower)) return false;
    return lower.length >= 4 || (w.length >= 2 && w === w.toUpperCase() && /\p{L}/u.test(w));
  });
}

/** Two words name the same thing when they share their first four letters ("cables", "cabling"), or are the same acronym. */
function sameWord(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length < 4 || y.length < 4) return x === y;
  return x.slice(0, 4) === y.slice(0, 4);
}

/** Whether `brings` names something the claims say: at least one of its content words is in them. */
export function bringsFromClaims(brings: string, claimText: string): boolean {
  const claimWords = claimText.match(/[\p{L}\p{N}]+/gu) ?? [];
  return contentWords(brings).some((w) => claimWords.some((c) => sameWord(w, c)));
}

/**
 * `pair` is the two company ids: a cited claim must have been shown for its
 * side and belong to that side's company.
 */
export function verifyJudgement(
  answer: JudgeAnswer,
  shown: readonly ShownClaim[],
  pair: { companyAId: string; companyBId: string },
  opportunities: readonly ShownOpportunity[] = [],
): VerifyResult {
  const fail = (check: VerifyCheck, reason: string): VerifyResult => ({ ok: false, check, reason });
  if (!answer.plausible) return fail("plausible", `the judge said no: ${collapse(answer.basis).slice(0, 200)}`);
  if (answer.fit === "none") return fail("fit", "the judge said plausible but named no fit");

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

  const opportunityId = answer.opportunity.trim().toUpperCase();
  const opportunity = opportunityId ? opportunities.find((o) => o.shortId === opportunityId) : undefined;
  if (opportunityId && !opportunity) return fail("opportunity", `${opportunityId} was not shown`);
  if (answer.fit === "same_opportunity" && !opportunity) return fail("opportunity", "a same-opportunity fit cites no shown opportunity");

  const brings = { A: collapse(answer.aBrings), B: collapse(answer.bBrings) };
  for (const side of ["A", "B"] as Side[]) {
    const thing = brings[side];
    if (!thing) return fail("brings", `nothing named for what ${side} brings`);
    if (thing.length > MAX_BRINGS_CHARS) return fail("brings", `what ${side} brings is ${thing.length} characters, more than ${MAX_BRINGS_CHARS}`);
    if (!contentWords(thing).length) return fail("brings", `what ${side} brings ("${thing}") is a field or a broad word, not a thing`);
    const claimText = cited[side].map((id) => byId.get(id)!.claim.value).join(" ");
    if (!bringsFromClaims(thing, claimText)) return fail("brings", `what ${side} brings ("${thing}") is not in ${side}'s cited claims`);
  }
  const words = (text: string) => contentWords(text).map((w) => w.toLowerCase().slice(0, 4)).sort().join(" ");
  if (words(brings.A) === words(brings.B)) return fail("brings", `both sides bring the same thing ("${brings.A}")`);

  const basis = collapse(answer.basis);
  if (basis.length < MIN_BASIS_CHARS || basis.length > MAX_BASIS_CHARS) {
    return fail("basis_length", `the basis is ${basis.length} characters, not ${MIN_BASIS_CHARS} to ${MAX_BASIS_CHARS}`);
  }
  const generic = genericPhraseIn(basis);
  if (generic) return fail("generic", `the basis rests on "${generic}"`);

  const firstStep = collapse(answer.firstStep);
  if (firstStep.length < MIN_FIRST_STEP_CHARS || firstStep.length > MAX_FIRST_STEP_CHARS) {
    return fail("first_step", `the first step is ${firstStep.length} characters, not ${MIN_FIRST_STEP_CHARS} to ${MAX_FIRST_STEP_CHARS}`);
  }

  for (const [name, text] of [
    ["basis", basis],
    ["first step", firstStep],
    ["what A brings", brings.A],
    ["what B brings", brings.B],
  ] as const) {
    const interest = interestWordsIn(text);
    if (interest.length) return fail("interest_words", `the ${name} says ${interest.map((w) => `"${w}"`).join(", ")}`);
    const eligibility = eligibilityClaim(text);
    if (eligibility) return fail("eligibility", `the ${name} says "${eligibility}"`);
    const apply = text.match(APPLY_PATTERN);
    if (apply) return fail("eligibility", `the ${name} says "${apply[0]}"`);
  }

  const sharedOn = [...new Set(answer.sharedOn.map(collapse).filter(Boolean))];
  if (!sharedOn.length || sharedOn.length > MAX_LABELS) return fail("labels", `${sharedOn.length} labels, not 1 to ${MAX_LABELS}`);
  const long = sharedOn.find((label) => label.length > MAX_LABEL_CHARS);
  if (long) return fail("labels", `the label "${long.slice(0, 60)}" is longer than ${MAX_LABEL_CHARS} characters`);

  const citedIds = new Set([...cited.A, ...cited.B]);
  const evidence = shown
    .filter((c) => citedIds.has(c.shortId))
    .map((c) => ({ companyId: c.claim.companyId, claimId: c.claim.id, field: c.claim.field, value: c.claim.value }));
  return {
    ok: true,
    connection: {
      basis,
      firstStep,
      fit: answer.fit,
      aBrings: brings.A,
      bBrings: brings.B,
      opportunityTitle: opportunity?.opportunity.title ?? null,
      sharedOn,
      evidence,
    },
  };
}
