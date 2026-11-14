/**
 * Checks on the judge's reply (A16), in code, after the model has answered.
 * Pure functions, so every rule is unit-tested.
 *
 * - Every id asked for is answered exactly once, and no other id: the judge
 *   can only answer for the matches it was given, never add one.
 * - Lengths stay within JUDGE_LIMITS.
 * - No text claims eligibility: any of ELIGIBILITY_PHRASES is refused,
 *   wherever it appears, and the next step may not tell the company to apply.
 * - No filler in `why` (FILLER_PHRASES) in the first answer; a retry that
 *   keeps it stands, because filler is style, not safety.
 * - A first-answer reject that does not follow from the model's `link` note
 *   and the shared areas is asked again (rejectProblem); a repeated reject stands.
 *
 * An entry that fails is asked once more with the reasons (retryFeedback);
 * one that fails again stays unjudged, and a later run picks it up.
 */
import { JudgeAnswer, MAX_UNCERTAINTIES } from "./output";

/**
 * Words and phrases that claim or deny eligibility, as lowercase substrings.
 * Whether a company may apply is a human decision (Eligibility is always
 * "potential_match"), so none of these may appear in any stored text.
 */
export const ELIGIBILITY_PHRASES: readonly string[] = [
  "eligib",
  "qualif",
  "guarantee",
  "entitle",
  "you will receive",
  "you will get",
  "will be granted",
  "will be awarded",
  "will be funded",
  "is certain to",
  "are certain to",
  "berättigad",
  "behörig",
];

/**
 * Phrases that stand in for a concrete reason, refused in `why`. On
 * 2026-11-14 most of EmbeddedArt's first answers read "X aligns with the
 * call's focus on Y" although the prompt asked for plain facts.
 */
export const FILLER_PHRASES: readonly string[] = ["align", "relevant to", "great opportunity", "perfect fit", "synerg", "leverag"];

/** A next step that tells the company to apply or submit, which assumes it may. */
const APPLY_PATTERNS: readonly RegExp[] = [
  /^\s*(apply|submit)\b/i,
  /\bapply (for|now|before|by)\b/i,
  /\bsubmit (an?|the|your) (application|proposal|bid)\b/i,
];

/** Lengths in characters, after whitespace is collapsed. */
export const JUDGE_LIMITS = {
  why: { min: 70, max: 450 },
  nextStep: { min: 15, max: 250 },
  uncertainty: { min: 3, max: 200 },
  rejectionReason: { min: 15, max: 500 },
} as const;

/** A checked judgement, as it is stored on the match row. */
export type Judgement = {
  rejected: boolean;
  /** Null for a reject. */
  why: string | null;
  nextStep: string | null;
  /** Empty for a reject. */
  uncertainties: string[];
  /** Null for a keep. */
  rejectionReason: string | null;
};

export type CheckedEntry = { id: string; judgement: Judgement };
/** `previous`: the entry as the model wrote it, when there was one, so a retry can correct it. */
export type FailedEntry = { id: string; problems: string[]; previous?: Record<string, unknown> };
export type CheckedReply = { accepted: CheckedEntry[]; failed: FailedEntry[] };

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** The first eligibility phrase in the text, or null. */
export function eligibilityClaim(text: string): string | null {
  const lower = text.toLowerCase();
  return ELIGIBILITY_PHRASES.find((phrase) => lower.includes(phrase)) ?? null;
}

function lengthProblem(field: string, text: string, { min, max }: { min: number; max: number }): string | null {
  if (!text) return `"${field}" is empty.`;
  if (text.length < min) return `"${field}" is too short (${text.length} characters; at least ${min}).`;
  if (text.length > max) return `"${field}" is too long (${text.length} characters; at most ${max}).`;
  return null;
}

const quoted = (text: string) => JSON.stringify(text.length > 160 ? `${text.slice(0, 157)}...` : text);

function claimProblem(field: string, text: string): string | null {
  const phrase = eligibilityClaim(text);
  return phrase
    ? `"${field}" uses "${phrase}" in ${quoted(text)}. Use no word starting with "eligib" or "qualif", and never "guarantee" or "entitled", in any key of the entry: for who can take part write "who may apply"; for scope write "whether <thing> is covered by the call".`
    : null;
}

function fillerProblem(why: string): string | null {
  const lower = why.toLowerCase();
  const phrase = FILLER_PHRASES.find((p) => lower.includes(p));
  return phrase
    ? `"why" uses "${phrase}" in ${quoted(why)}. Write it as one full sentence with a verb that says what the company makes or does and what the opportunity funds, tests or offers, without that word.`
    : null;
}

const isClosedNote = (note: string) => note.startsWith("closed");

const linkNote = (link: string) => clean(link).toLowerCase().replace(/^["'(]+/, "");

/**
 * Whether a first-answer reject needs a second look, from the model's own
 * `link` note and the areas the opportunity shares with the company (the
 * matcher's `matchedOn`):
 *
 * - "closed: ..." (open only to another kind of organisation): no.
 * - "none" (a different field entirely) while the two share an area: yes,
 *   sharing one means it is probably not a different field.
 * - a real link named and still rejected: yes.
 *
 * The retry says why. A reject the model repeats on the retry stands: the
 * rule asks it to reconsider once, it does not overrule it (CBRN protective
 * gear shares only "defence" with EmbeddedArt and is rightly rejected).
 *
 * On 2026-11-14, without these rules, the model rejected EmbeddedArt's Baltic
 * Marine Watchdog Challenge (autonomous sea surveillance) as "a different
 * field" from maritime surveillance in one run and kept it in the next.
 */
export function rejectProblem(link: string, sharedAreas: readonly string[]): string | null {
  const note = linkNote(link);
  if (isClosedNote(note)) return null;
  const none = note === "" || /^(none|nothing|n\/a)\b/.test(note);
  if (!none) {
    return `The verdict is "reject" but "link" names ${quoted(clean(link))}, something the company has that could play a part. Keep it and write what is unsure in uncertainties, or set link to "closed: ..." if the text closes it to this kind of company.`;
  }
  if (sharedAreas.length) {
    return `The verdict is "reject" for a different field, but the opportunity shares ${sharedAreas.join(", ")} with the company, so it is not a different field. Keep it and write what is unsure in uncertainties, or set link to "closed: ..." if the text closes it to this kind of company.`;
  }
  return null;
}

export type EntryContext = {
  /** What the opportunity shares with the company. */
  sharedAreas?: readonly string[];
  /** A retry: a reject the model repeats stands (see rejectProblem). */
  retry?: boolean;
};

/** One entry of the reply: a judgement, or what is wrong with it. */
export function checkEntry(raw: unknown, { sharedAreas = [], retry = false }: EntryContext = {}): { judgement: Judgement } | { problems: string[] } {
  const parsed = JudgeAnswer.safeParse(raw);
  if (!parsed.success) return { problems: ["The entry does not have the keys about, link, verdict, rejectionReason, why, nextStep and uncertainties."] };
  const answer = parsed.data;
  const problems: (string | null)[] = [];

  if (answer.verdict === "reject") {
    const reason = clean(answer.rejectionReason);
    problems.push(lengthProblem("rejectionReason", reason, JUDGE_LIMITS.rejectionReason), claimProblem("rejectionReason", reason));
    if (!retry) problems.push(rejectProblem(answer.link, sharedAreas));
    const found = problems.filter((p): p is string => p !== null);
    return found.length ? { problems: found } : { judgement: { rejected: true, why: null, nextStep: null, uncertainties: [], rejectionReason: reason } };
  }

  const why = clean(answer.why);
  const nextStep = clean(answer.nextStep);
  const uncertainties = [...new Set(answer.uncertainties.map(clean).filter(Boolean))];
  // Filler is style, not safety: the first answer is sent back for it, a retry that keeps it stands.
  problems.push(lengthProblem("why", why, JUDGE_LIMITS.why), claimProblem("why", why), retry ? null : fillerProblem(why));
  problems.push(lengthProblem("nextStep", nextStep, JUDGE_LIMITS.nextStep), claimProblem("nextStep", nextStep));
  if (APPLY_PATTERNS.some((pattern) => pattern.test(nextStep))) {
    problems.push(
      `"nextStep" tells the company to apply or submit in ${quoted(nextStep)}. Give a step that does not assume it may apply, such as reading a named part of the call or writing to the contact.`,
    );
  }
  if (uncertainties.length < 1 || uncertainties.length > MAX_UNCERTAINTIES) {
    problems.push(`"uncertainties" has ${uncertainties.length} items; a keep needs 1 to ${MAX_UNCERTAINTIES}.`);
  }
  for (const item of uncertainties) problems.push(lengthProblem("uncertainties item", item, JUDGE_LIMITS.uncertainty), claimProblem("uncertainties", item));

  const found = problems.filter((p): p is string => p !== null);
  return found.length ? { problems: [...new Set(found)] } : { judgement: { rejected: false, why, nextStep, uncertainties, rejectionReason: null } };
}

/** How often each id appears as a key in the raw text: JSON.parse would silently keep only the last of two. */
function keyCount(reply: string, id: string): number {
  return reply.match(new RegExp(`"${id}"\\s*:`, "g"))?.length ?? 0;
}

/**
 * Checks the whole reply against the ids that were asked. A reply that is not
 * one JSON object, repeats an id or answers an id that was not asked fails
 * every id (the entries may be shifted); otherwise each entry stands alone.
 */
export function checkJudgeReply(
  reply: string,
  ids: readonly string[],
  { sharedAreas = {}, retry = false }: { sharedAreas?: Readonly<Record<string, readonly string[]>>; retry?: boolean } = {},
): CheckedReply {
  const failAll = (problem: string): CheckedReply => ({ accepted: [], failed: ids.map((id) => ({ id, problems: [problem] })) });

  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  let json: unknown;
  try {
    json = JSON.parse(fenced ? fenced[1] : reply);
  } catch {
    return failAll("The answer was not one JSON object.");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return failAll("The answer was not one JSON object.");

  const entries = json as Record<string, unknown>;
  const unknown = Object.keys(entries).filter((key) => !ids.includes(key));
  if (unknown.length) return failAll(`The answer had entries for ${unknown.join(", ")}, which were not asked for. Answer only for ${ids.join(", ")}.`);
  const repeated = ids.filter((id) => keyCount(reply, id) > 1);
  if (repeated.length) return failAll(`The answer had ${repeated.join(", ")} more than once. Answer each id exactly once.`);

  const result: CheckedReply = { accepted: [], failed: [] };
  for (const id of ids) {
    if (!(id in entries)) {
      result.failed.push({ id, problems: ["There was no entry for this id."] });
      continue;
    }
    const checked = checkEntry(entries[id], { sharedAreas: sharedAreas[id] ?? [], retry });
    if ("judgement" in checked) result.accepted.push({ id, judgement: checked.judgement });
    else {
      const raw = entries[id];
      result.failed.push({ id, problems: checked.problems, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? { previous: raw as Record<string, unknown> } : {}) });
    }
  }
  return result;
}

/**
 * The message added to a retry: what was wrong, per id, with the entry as the
 * model wrote it. On 2026-11-14 a retry that only listed the problems often
 * moved a refused word from one key to another; with its own entry in front
 * of it, the model changes the flagged words and keeps the rest.
 */
export function retryFeedback(failed: readonly FailedEntry[]): string {
  const ids = failed.map((f) => f.id);
  const lines = failed.flatMap((f) => [
    `- ${f.id}: ${f.problems.join(" ")}`,
    ...(f.previous ? [`  Your entry was: ${JSON.stringify(f.previous)}`] : []),
  ]);
  return [
    "Your first answer had problems, so these entries were not accepted:",
    ...lines,
    `Answer again for ${ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`} only. Where your entry is shown, keep what is fine and change only what the problems name. Before you answer, check every key once more for words starting with "eligib" or "qualif" and for "align" or "relevant to".`,
  ].join("\n");
}
