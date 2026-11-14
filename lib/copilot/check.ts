/**
 * The output check (B8): runs in code on every assistant answer before it is
 * shown or stored. Pure functions, so every rule is unit-tested.
 *
 * 1. Citations: a cite number the tools never gave is removed, and so is a
 *    link the tools never returned. A sentence that states a fact (a number, a
 *    date, an amount, a name) without a valid citation takes the citation of
 *    a later sentence in the same line (a list item or paragraph cited at its
 *    end); with none after it, it is removed.
 * 2. Eligibility: a sentence that sounds like an eligibility decision ("you
 *    are eligible", "you qualify", "you can apply", "you will get") is
 *    rewritten to "potential match". When that happens, or when the member
 *    asked about eligibility, the answer gets the requirements from the source
 *    ("who may apply") and the BSP staff contact.
 * 3. What the tools did is confirmed in code: a handoff with "sent to BSP
 *    staff", a save with "Saved to your list" and its source.
 * 4. The "information only" note is appended.
 *
 * "States a fact" is a heuristic (see isFactual): it can miss a fact written
 * in lower-case words without a reporting verb, such as "the deadline is next
 * week". When sentences are removed, runTurn (turn.ts) asks the model once to
 * cite or drop them and checks the new answer again.
 */
import { HANDOFF_SENT_TEXT } from "./handoff";
import { BSP_CONTACT, INFORMATION_ONLY_NOTE } from "./policy";
import { toCitation, type Citation, type SourceEntry } from "./sources";

/** Shown when nothing with a source is left of the answer. */
export const NO_SOURCED_ANSWER =
  "I could not find a sourced answer to that in the Virtual Science Park store. I can pass your question to BSP staff if you like.";

/** What an eligibility sentence becomes (before its citations). */
export const POTENTIAL_MATCH_SENTENCE = "This is a potential match, not a decision on who may apply";

/**
 * Sentences that decide or deny eligibility. Naming the topic ("BSP staff can
 * check eligibility") is not a decision; saying who is or is not eligible is.
 */
export const ELIGIBILITY_PATTERNS: readonly RegExp[] = [
  /\b(?:is|are|'re|be|being|been|seem|seems|appear|appears|look|looks|remain|remains)\s+(?:\w+\s+){0,2}?(?:eligible|ineligible|qualified|entitled)\b/i,
  /\beligible\s+(?:for|to)\b/i,
  /\beligibility\s+(?:is|has been|was|will be)\s+(?:\w+\s+)?(?:confirmed|approved|clear|certain|guaranteed|met|fulfilled)\b/i,
  /\b(?:qualify|qualifies|qualifying|disqualif\w*)\b|\bqualified\s+(?:for|to)\b/i,
  /\bentitlement\b|\bentitled\s+to\b/i,
  /\bguarantee/i,
  /\b(?:you|we|your company|the company|they)\s+(?:can|may|could|are allowed to|is allowed to|are able to|is able to|will be able to)\s+(?:apply|participate|take part)\b/i,
  /\b(?:you|we|your company|the company|they)\s+(?:meet|meets|fulfil|fulfils|fulfill|fulfills|satisfy|satisfies|match|matches)\s+(?:all\s+|the\s+|its\s+|their\s+)*(?:eligibility\s+)?(?:requirements|criteria|conditions)\b/i,
  /\b(?:you|we|your company|the company)\s+(?:will|would)\s+(?:receive|get|be granted|be awarded|be funded|be accepted|be approved|be selected)\b/i,
  /\ballowed to apply\b/i,
  /berättigad|behörig/i,
];

/** Whether the member's message asks for an eligibility decision. */
export function asksEligibility(message: string): boolean {
  return /eligib|qualif|entitled|\b(?:can|may|could)\s+(?:we|i|our company)\s+(?:apply|take part|participate)\b|\b(?:are|am)\s+(?:we|i)\s+allowed\s+to\s+apply\b|\bdo\s+(?:we|i)\s+(?:meet|fulfil|fulfill|fit|match)\b|berättigad|behörig|\b(?:får|kan)\s+vi\s+söka\b/i.test(
    message,
  );
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The patterns plus "<company> can apply" and the like for the member's own name. */
function eligibilityPatterns(companyName?: string): RegExp[] {
  if (!companyName?.trim()) return [...ELIGIBILITY_PATTERNS];
  const name = escapeRegExp(companyName.trim());
  return [
    ...ELIGIBILITY_PATTERNS,
    new RegExp(`\\b${name}\\s+(?:can|may|could|is allowed to|will be able to)\\s+(?:apply|participate|take part)\\b`, "i"),
    new RegExp(`\\b${name}\\s+(?:meets|fulfils|fulfills|satisfies)\\b`, "i"),
    new RegExp(`\\b${name}\\s+(?:will|would)\\s+(?:receive|get|be granted|be awarded|be funded|be accepted|be selected)\\b`, "i"),
  ];
}

export function soundsLikeEligibilityDecision(sentence: string, companyName?: string): boolean {
  return eligibilityPatterns(companyName).some((pattern) => pattern.test(sentence));
}

const MONTHS = /\b(?:january|february|march|april|june|july|august|september|october|november|december)\b|\bmay\s+\d/i;
const MONEY = /[\u20AC$\u00A3%]|\b(?:sek|eur|kr|msek|mkr|kronor|euro)\b/i;

/** Capitalised words that do not make a sentence factual on their own. */
const NEUTRAL_CAPS = new Set([
  "I", "I'm", "I'll", "I've", "BSP", "Blue", "Science", "Park", "Virtual", "Copilot", "Information", "English",
  "You", "Your", "If", "The", "This", "These", "That", "Here", "Yes", "No", "OK",
]);

/** Generic title words that do not identify a source. */
const GENERIC_TITLE_WORDS = new Set([
  "The", "And", "For", "With", "From", "Test", "Testing", "Call", "Calls", "Lab", "Day", "Event", "Events", "News",
  "Funding", "Programme", "Program", "Centre", "Center", "Innovation", "Innovations", "Research", "Open", "New", "Hand",
]);

const wordOf = (token: string) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'\u2019]+$/gu, "");

/** Capitalised words of the sources' titles and publishers: naming one is stating a fact. */
export function storeTerms(sources: readonly SourceEntry[]): Set<string> {
  const terms = new Set<string>();
  for (const s of sources) {
    for (const token of `${s.title} ${s.publisher ?? ""}`.split(/\s+/)) {
      const word = wordOf(token);
      if (word.length >= 3 && /^\p{Lu}/u.test(word) && !GENERIC_TITLE_WORDS.has(word) && !NEUTRAL_CAPS.has(word)) terms.add(word);
    }
  }
  return terms;
}

/** Verbs that report what an opportunity or a profile says, also in an all lower-case sentence ("it funds ..."). */
const FACT_VERBS =
  /\b(?:funds?|funded|finances?|offers?|runs|covers?|closes?|requires?|required|supports?|provides?|includes?|hosts?|targets?|takes place|lasts?|costs?|pays?|grants?|awards?|accepts?|says|states|describes?|focuses)\b/i;

/**
 * Whether a sentence (citations already taken out) states a fact: a number,
 * a date, an amount, a link, a capitalised name after the first word, a name
 * from the sources, or a verb that reports what a source says. Questions and
 * the staff contact line never do.
 */
export function isFactual(sentence: string, { terms = new Set<string>(), companyName }: { terms?: ReadonlySet<string>; companyName?: string } = {}): boolean {
  const text = sentence.trim();
  if (!text || /\?["\u201D')\]]*$/.test(text)) return false;
  if (text.includes(BSP_CONTACT)) return false;
  if (/https?:\/\//i.test(text) || /\d/.test(text) || MONTHS.test(text) || MONEY.test(text)) return true;
  const own = new Set((companyName ?? "").split(/\s+/).map(wordOf).filter(Boolean));
  const words = text.split(/\s+/).map(wordOf).filter(Boolean);
  if (words.some((w) => terms.has(w))) return true;
  if (words.slice(1).some((w) => /^\p{Lu}/u.test(w) && !NEUTRAL_CAPS.has(w) && !own.has(w))) return true;
  return FACT_VERBS.test(text);
}

/** Whether any sentence of a text states a fact (citations aside). */
export function statesFacts(text: string, companyName?: string): boolean {
  return text
    .split("\n")
    .flatMap((line) => splitSentences(line.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s+/, "")))
    .some((sentence) => isFactual(sentence.replace(MARKS, ""), { companyName }));
}

// ---------------------------------------------------------------------------
// Text handling
// ---------------------------------------------------------------------------

const MARKS = /\s*\[(\d+(?:\s*,\s*\d+)*)\]/g;
const marks = (numbers: readonly number[]) => [...new Set(numbers)].map((n) => `[${n}]`).join("");

function citedNumbers(text: string): number[] {
  return [...text.matchAll(MARKS)].flatMap((m) => m[1].split(",").map((n) => Number(n.trim())));
}

/** Markdown and links turned into plain text with [n] marks. */
function normalise(text: string, urlNumber: (url: string) => number | undefined, changes: string[]): string {
  let out = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*|__/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[*\u2022]\s+/gm, "- ");
  // "(cite [1])" and "(offerings field, cite [1])" become "[1]".
  out = out.replace(/\s*\((?:[^()\n]*?,\s*)?cite\s*((?:\[\d+\]\s*)+)\)/gi, (_, group: string) => ` ${group.trim()}`).replace(/\bcite\s+(\[\d+\])/gi, "$1");
  out = out.replace(/\[([^\]\n]+)\]\((\S+?)\)/g, (_, label: string, url: string) => {
    const n = urlNumber(url);
    if (!n) changes.push(`Removed a link that no tool returned: ${url}`);
    return n ? `${label} [${n}]` : label;
  });
  out = out.replace(/<?(https?:\/\/[^\s<>()\]]+?)>?(?=[.,;:!?)]?(?:\s|$))/g, (_, url: string) => {
    const n = urlNumber(url);
    if (!n) changes.push(`Removed a link that no tool returned: ${url}`);
    return n ? `[${n}]` : "";
  });
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SENTENCE_START = /[\p{Lu}\p{N}"\u201C'\u2018(\[]/u;

/** Where a line breaks into sentences: after . ! or ? (and a closing quote) before a capital, never inside quotes. */
function sentenceBreaks(line: string): number[] {
  const breaks: number[] = [];
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const closesQuote = (c === '"' && quoted) || c === "\u201D";
    if (c === '"') quoted = !quoted;
    else if (c === "\u201C") quoted = true;
    else if (c === "\u201D") quoted = false;
    const ends = (!quoted && /[.!?]/.test(c)) || (closesQuote && /[.!?]/.test(line[i - 1] ?? ""));
    if (!ends || quoted) continue;
    const next = line.slice(i + 1).match(/^\s+(\S)/)?.[1];
    if (next && SENTENCE_START.test(next)) breaks.push(i + 1);
  }
  return breaks;
}

/** A line's sentences; citation marks that start a part belong to the sentence before. */
export function splitSentences(line: string): string[] {
  const parts: string[] = [];
  let from = 0;
  for (const at of sentenceBreaks(line)) {
    parts.push(line.slice(from, at).trim());
    from = at;
  }
  parts.push(line.slice(from).trim());

  const out: string[] = [];
  for (const part of parts) {
    const lead = part.match(/^(\s*\[\d+(?:\s*,\s*\d+)*\])+\s*[.!?]?/);
    if (lead && out.length) {
      const prev = out.pop()!;
      const ending = prev.match(/[.!?]["\u201D]?$/)?.[0] ?? "";
      out.push(`${prev.slice(0, prev.length - ending.length)}${ending.length > 1 ? ending.slice(1) : ""} ${lead[0].replace(/[.!?]$/, "").trim()}${ending.slice(0, 1)}`);
      const rest = part.slice(lead[0].length).trim();
      if (rest) out.push(rest);
    } else {
      out.push(part);
    }
  }
  return out.filter((s) => s.trim());
}

export type CheckInput = {
  /** The assistant's answer. */
  text: string;
  /** Every source the tools returned this turn. */
  sources: readonly SourceEntry[];
  /** The member asked whether the company is eligible, may apply, and so on. */
  askedEligibility?: boolean;
  /** contactStaff created a handoff this turn. */
  handoffSent?: boolean;
  /** Opportunities saveOpportunity saved this turn. */
  savedOpportunityIds?: readonly string[];
  /** The member's company, so its own name does not count as a fact. */
  companyName?: string;
};

export type CheckedAnswer = {
  text: string;
  /** The sources the final text cites, numbered 1, 2, ... in order of first use. */
  citations: Citation[];
  /** What the check changed, for logs and tests. */
  changes: string[];
};

export function checkAnswer({ text, sources, askedEligibility = false, handoffSent = false, savedOpportunityIds = [], companyName }: CheckInput): CheckedAnswer {
  const changes: string[] = [];
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const urlNumber = (url: string) => sources.find((s) => s.url === url || s.url === url.replace(/[.,;:]+$/, ""))?.n;
  const terms = storeTerms(sources);

  let rewrote = false;
  const eligibilityCites: number[] = [];
  const kept: string[] = [];
  const seenSentences = new Set<string>();

  for (const rawLine of normalise(text, urlNumber, changes).split("\n")) {
    if (!rawLine.trim()) {
      kept.push("");
      continue;
    }
    const prefix = rawLine.match(/^\s*(?:-|\d+[.)])\s+/)?.[0] ?? "";
    const sentences: string[] = [];
    const parts = splitSentences(rawLine.slice(prefix.length))
      .map((sentence) => {
        const numbers = citedNumbers(sentence);
        const valid = numbers.filter((n) => byNumber.has(n));
        if (valid.length < numbers.length) changes.push(`Removed cite numbers no tool gave: ${numbers.filter((n) => !byNumber.has(n)).join(", ")}`);
        const body = sentence.replace(MARKS, "").replace(/\s+([.!?,;:])/g, "$1").trim();
        return { sentence, body, valid, eligibility: soundsLikeEligibilityDecision(body, companyName) };
      })
      .filter((p) => p.body && !/^[.!?,;:]+$/.test(p.body));

    for (const [index, { sentence, body, valid, eligibility }] of parts.entries()) {
      let out: string;
      if (eligibility) {
        rewrote = true;
        eligibilityCites.push(...valid);
        out = `${POTENTIAL_MATCH_SENTENCE}${valid.length ? ` ${marks(valid)}` : ""}.`;
        changes.push(`Rewrote an eligibility sentence: "${body}"`);
      } else if (!valid.length && isFactual(body, { terms, companyName })) {
        // A citation at the end of a list item or paragraph covers the sentences before it in that line.
        const later = parts.slice(index + 1).find((p) => p.valid.length && !p.eligibility);
        if (!later) {
          changes.push(`Removed a sentence without a source: "${body}"`);
          continue;
        }
        const ending = body.match(/[.!?]$/)?.[0] ?? ".";
        out = `${body.replace(/[.!?]$/, "")} ${marks(later.valid)}${ending}`;
        changes.push(`Gave a sentence the citation at the end of its line: "${body}"`);
      } else {
        out = sentence.replace(MARKS, (_, group: string) => {
          const keep = group.split(",").map((n) => Number(n.trim())).filter((n) => byNumber.has(n));
          return keep.length ? ` ${marks(keep)}` : "";
        });
        out = out.replace(/\s+([.!?,;:])/g, "$1").replace(/(\[\d+\])([A-Za-z])/g, "$1 $2").trim();
      }
      if (seenSentences.has(out)) continue;
      seenSentences.add(out);
      sentences.push(out);
    }
    if (sentences.length) kept.push(`${prefix}${sentences.join(" ")}`);
  }

  let body = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // A lead-in line ("Here are some options:") with nothing after it says nothing.
  const leadIn = body.match(/(?:^|\n)[^\n]*:\s*$/);
  if (leadIn) body = body.slice(0, leadIn.index).trim();
  // What the tools did this turn is confirmed in code, whatever the model wrote about it.
  const done: string[] = [];
  const saved = sources.filter((s) => s.opportunityId && savedOpportunityIds.includes(s.opportunityId));
  if (saved.length && !/\bsaved\b/i.test(body)) done.push(...saved.map((s) => `Saved to your list: ${s.title} [${s.n}].`));
  if (handoffSent && !/sent to BSP staff/i.test(body)) done.push(HANDOFF_SENT_TEXT);

  const removedFacts = changes.some((c) => c.startsWith("Removed a sentence"));
  if (!body || (removedFacts && !rewrote && !citedNumbers(body).length)) {
    if (done.length) body = "";
    else {
      if (body) changes.push("Nothing with a source was left.");
      body = NO_SOURCED_ANSWER;
    }
  }

  const extra: string[] = [...done];
  if (rewrote || askedEligibility) {
    if (!/potential match/i.test(body)) extra.push(`${POTENTIAL_MATCH_SENTENCE}.`);
    const used = new Set([...eligibilityCites, ...citedNumbers(body)]);
    const withRules = sources.filter((s) => s.whoMayApply);
    const cited = withRules.filter((s) => used.has(s.n));
    const said = (rule: string) => body.replace(/\s+/g, " ").includes(rule.replace(/\s+/g, " ").slice(0, 40));
    const requirements = (cited.length ? cited : withRules).slice(0, 2).filter((s) => !said(s.whoMayApply!));
    const quotedAlready = (cited.length ? cited : withRules).slice(0, 2).some((s) => said(s.whoMayApply!));
    for (const s of requirements) {
      extra.push(`Who may apply, as the source states it for ${s.title}: "${s.whoMayApply}" [${s.n}].`);
    }
    if (!requirements.length && !quotedAlready) extra.push("The store has no stated requirements for this; the source text and BSP staff can tell you who may apply.");
    if (!body.includes(BSP_CONTACT)) extra.push(`BSP staff can help you check this: ${BSP_CONTACT}.`);
  }

  const full = [body, extra.join("\n"), INFORMATION_ONLY_NOTE].filter(Boolean).join("\n\n").replace(/(\[\d+\]) (?=\[\d+\])/g, "$1");
  return { ...renumber(full, byNumber), changes };
}

/** Numbers the cited sources 1, 2, ... in order of first use, in the text and the list. */
function renumber(text: string, byNumber: ReadonlyMap<number, SourceEntry>): { text: string; citations: Citation[] } {
  const order: number[] = [];
  for (const n of citedNumbers(text)) if (byNumber.has(n) && !order.includes(n)) order.push(n);
  const next = new Map(order.map((n, i) => [n, i + 1]));
  const renumbered = text.replace(/\[(\d+)\]/g, (whole, n: string) => (next.has(Number(n)) ? `[${next.get(Number(n))}]` : whole));
  return { text: renumbered, citations: order.map((n) => toCitation(byNumber.get(n)!, next.get(n)!)) };
}
