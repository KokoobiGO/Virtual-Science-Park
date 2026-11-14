/**
 * Checks on a trend note (A27) before it is stored. A note that fails is
 * asked for once more with the problems (write.ts); a second failure means no
 * note for that area this week. Every problem is worded so the retry can act
 * on it.
 *
 * From the brief: every cited id is an input; at least 2 sources; title and
 * body within their lengths (and 3 to 5 sentences); no promise words; every
 * 4-digit year and every amount with a currency is in a cited input.
 *
 * Added after the real runs on 2026-11-14, each for a mistake the model made
 * there: every written-out date is in a cited input ("14 February" for 16
 * February), and in the right role (a deadline written as an opening date);
 * every cited call's closing date is in the note ("two calls close on 14
 * January" when one closes on 16 February); "this week", "opens", "new" and
 * "launched" only about inputs marked this week or not open yet; no worked-out
 * dates ("this month", "within weeks"); no funder that no cited input names
 * (a Vinnova call called an EU call); no input ids in the text.
 *
 * Added on 2026-11-14 evening for the stronger super-vl model, which writes
 * fluent analysis the inputs do not contain: the note cites at least one
 * input that is new (when any is), and has no market analysis or prediction
 * ("growing demand", "signals a shift", "is expected to", "key driver") that
 * no cited input states itself. The body is now two or three sentences.
 *
 * All of them are cheap guards. None can catch a wrong reading of an input,
 * an invented connection between two inputs, or a fact about an input the
 * note does not cite.
 */

export const TITLE_MAX_CHARS = 80;
export const TITLE_MIN_CHARS = 10;
/** Two or three plain sentences. */
export const BODY_MIN_SENTENCES = 2;
export const BODY_MAX_SENTENCES = 3;
export const BODY_MIN_CHARS = 100;
export const BODY_MAX_CHARS = 700;
export const MIN_SOURCES = 2;

/**
 * Analysis and predictions a note may not add on its own. A match is fine
 * only when a cited input has the same words: then the input says it.
 */
export const ANALYSIS_PATTERNS: readonly RegExp[] = [
  /\bgrowing (?:demand|interest|need|focus|importance|market|number|role)\b/i,
  /\b(?:increasing(?:ly)?|rising|surging|booming|accelerating)\b/i,
  /\bdemand for\b/i,
  /\b(?:trends?|momentum|surge|boom)\b/i,
  /\bsignal(?:s|ling|ing)?\b/i,
  /\bshift(?:s|ing)? (?:to|toward|towards|in|from)\b/i,
  /\b(?:will|is set to|are set to|is poised to|are poised to|is expected to|are expected to|is likely to|are likely to) (?:grow|increase|rise|drive|boost|create|transform|reshape|expand|accelerate|shape|lead|open|strengthen|benefit|help|make|become|fuel|spur)\b/i,
  /\b(?:likely|poised)\b/i,
  /\b(?:key|crucial|vital|pivotal) (?:driver|player|role|enabler|priority|step|area|opportunity)\b/i,
  /\bcompetitive (?:edge|advantage)\b/i,
  /\bmarket (?:demand|growth|opportunit(?:y|ies)|potential)\b/i,
  /\b(?:more and more|ever more)\b/i,
  /\b(?:underscores?|underlines?) (?:the|a|its)\b/i,
];

/** The analysis phrases in the note that no cited input states, as written in the note. */
export function unsupportedAnalysis(text: string, citedText: string): string[] {
  const inputs = citedText.toLowerCase();
  const found: string[] = [];
  for (const pattern of ANALYSIS_PATTERNS) {
    for (const m of text.matchAll(new RegExp(pattern.source, "gi"))) {
      if (!inputs.includes(m[0].toLowerCase()) && !found.includes(m[0])) found.push(m[0]);
    }
  }
  return found;
}

/** Sentences end with . ! or ? before a space and a capital letter or digit, so "2.5" and "e.g. a call" do not end one. */
export function sentenceCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9ÅÄÖ"“])/).length : 0;
}

/**
 * Words that say or suggest that someone is eligible or will get something.
 * Matched case-insensitively anywhere in the title and body, so "qualif"
 * catches "qualify", "qualifies" and "qualification".
 */
export const PROMISE_WORDS = ["eligible", "qualif", "guarantee", "will receive", "entitled"] as const;

/** What the model answered, sources as the short ids it saw (S1..S8). */
export type TrendDraft = { title: string; body: string; sources: string[] };

/** One input as the model saw it: its short id and its block text, and whether it is new (inputs.ts, `isFresh`) when that is known. */
export type CheckedInput = { id: string; text: string; fresh?: boolean };

// ---------------------------------------------------------------------------
// Years and amounts
// ---------------------------------------------------------------------------

const YEAR = /\b(?:19|20)\d{2}\b/g;

/** Every 4-digit year (1900-2099) in the text, once each. */
export function yearsIn(text: string): string[] {
  return [...new Set(text.match(YEAR) ?? [])];
}

/**
 * A number as people write it: 2 500 000, 2,500,000, 2.5, 2,5. The groups may
 * be split by any space but a line break; JavaScript's \s includes the
 * no-break and thin spaces Swedish text uses.
 */
const NUM = String.raw`\d{1,3}(?:(?:[^\S\r\n]|[,.])\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;

const SCALE_WORDS: Record<string, number> = {
  thousand: 1e3,
  k: 1e3,
  tusen: 1e3,
  million: 1e6,
  millions: 1e6,
  mn: 1e6,
  m: 1e6,
  miljon: 1e6,
  miljoner: 1e6,
  billion: 1e9,
  billions: 1e9,
  bn: 1e9,
  miljard: 1e9,
  miljarder: 1e9,
};

/** Currencies written with their scale in one word: "5 MSEK" is five million kronor. */
const SCALED_CURRENCIES: Record<string, number> = { msek: 1e6, meur: 1e6, musd: 1e6, mnkr: 1e6, mkr: 1e6, mdkr: 1e9, tkr: 1e3 };

const SCALE = Object.keys(SCALE_WORDS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const SCALED_CURRENCY = Object.keys(SCALED_CURRENCIES).join("|");
const CURRENCY_BEFORE = String.raw`SEK|EUR|USD|GBP|NOK|DKK|€|\$|£`;
const CURRENCY_AFTER = String.raw`${SCALED_CURRENCY}|SEK|EUR|USD|GBP|NOK|DKK|kronor|kr|euros?|dollars?|€|\$|£`;
/** Not glued to a letter, so "5 m" is a scale but "5 more" is not. */
const END = "(?![a-zåäö])";

/** "SEK 5 million", "€2.5m" */
const AMOUNT_BEFORE = new RegExp(String.raw`(?:${CURRENCY_BEFORE})\s?(${NUM})(?:\s?(${SCALE})${END})?`, "gi");
/** "5 million SEK", "2 500 000 kronor", "5 MSEK" */
const AMOUNT_AFTER = new RegExp(String.raw`(?<![\d.,])(${NUM})\s?(?:(${SCALE})\s?)?(${CURRENCY_AFTER})${END}`, "gi");
/** Any number with an optional scale, for reading the inputs. */
const ANY_NUMBER = new RegExp(String.raw`(?<![\d.,])(${NUM})(?:\s?(${SCALE}|${SCALED_CURRENCY})${END})?`, "gi");

/** What a written number can mean. "2,500" is 2.5 or 2500; both are kept, so the check never fails on notation alone. */
export function numberValues(written: string): number[] {
  const s = written.replace(/\s/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    return [Number(s.split(grouping).join("").replace(decimal, "."))].filter(Number.isFinite);
  }
  const separator = hasComma ? "," : hasDot ? "." : null;
  if (!separator) return [Number(s)].filter(Number.isFinite);
  const parts = s.split(separator);
  const values: number[] = [];
  if (parts.length === 2) values.push(Number(parts.join(".")));
  if (parts.slice(1).every((p) => p.length === 3)) values.push(Number(parts.join("")));
  return values.filter(Number.isFinite);
}

const scaleOf = (word: string | undefined) => (word ? (SCALE_WORDS[word.toLowerCase()] ?? SCALED_CURRENCIES[word.toLowerCase()] ?? 1) : 1);

/** Values compare as rounded keys, so 2.5 × 1e6 and 2500000 are the same. */
const key = (value: number) => String(Math.round(value * 1000) / 1000);

export type Amount = { written: string; values: number[] };

/** Every amount with a currency in the text, with what it can mean. */
export function amountsIn(text: string): Amount[] {
  const found: { index: number; end: number; amount: Amount }[] = [];
  for (const m of text.matchAll(AMOUNT_BEFORE)) {
    const scale = scaleOf(m[2]);
    found.push({ index: m.index, end: m.index + m[0].length, amount: { written: m[0].trim(), values: numberValues(m[1]).map((v) => v * scale) } });
  }
  for (const m of text.matchAll(AMOUNT_AFTER)) {
    // "€5 million euro" would be found twice: keep the first.
    if (found.some((f) => m.index < f.end && f.index < m.index + m[0].length)) continue;
    const scale = scaleOf(m[2]) * scaleOf(m[3]);
    found.push({ index: m.index, end: m.index + m[0].length, amount: { written: m[0].trim(), values: numberValues(m[1]).map((v) => v * scale) } });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.amount);
}

/** Every value a number in the text can have, with and without the scale written after it. */
function valuesIn(text: string): Set<string> {
  const keys = new Set<string>();
  for (const m of text.matchAll(ANY_NUMBER)) {
    const scale = scaleOf(m[2]);
    for (const value of numberValues(m[1])) {
      keys.add(key(value));
      keys.add(key(value * scale));
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SV_MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
/** "14 Jan", "16 Feb.", "Sept 3". */
const SHORT_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = [...new Set([...EN_MONTHS, ...SV_MONTHS]), "sept", ...SHORT_MONTHS.filter((m) => m !== "may")]
  .sort((a, b) => b.length - a.length)
  .join("|");
const monthNumber = (name: string) => {
  const lower = name.toLowerCase();
  for (const list of [EN_MONTHS, SV_MONTHS, SHORT_MONTHS]) {
    const i = list.indexOf(lower === "sept" ? "sep" : lower);
    if (i >= 0) return i + 1;
  }
  return 0;
};

/** "2 December 2026", "2nd of December", "2 december 2026" (Swedish) */
const DAY_MONTH = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? (${MONTH})\b(?:,? (\d{4})\b)?`, "gi");
/** "December 2, 2026", "December 2" */
const MONTH_DAY = new RegExp(String.raw`\b(${MONTH}) (\d{1,2})(?:st|nd|rd|th)?\b(?:,? (\d{4})\b)?`, "gi");
/** "February 2027", no day */
const MONTH_YEAR = new RegExp(String.raw`\b(${MONTH}) (\d{4})\b`, "gi");
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

export type WrittenDate = { written: string; index: number; day: number | null; month: number; year: number | null };

/** Every date in the text with at least a month and a day or a year, in English, Swedish or YYYY-MM-DD. */
export function datesIn(text: string): WrittenDate[] {
  const found: { index: number; end: number; date: WrittenDate }[] = [];
  const add = (m: RegExpMatchArray, date: Omit<WrittenDate, "written" | "index">) => {
    const index = m.index!;
    const end = index + m[0].length;
    if (found.some((f) => index < f.end && f.index < end)) return;
    if (date.month < 1 || date.month > 12 || (date.day !== null && (date.day < 1 || date.day > 31))) return;
    found.push({ index, end, date: { written: m[0], index, ...date } });
  };
  const year = (y: string | undefined) => (y ? Number(y) : null);
  for (const m of text.matchAll(ISO_DATE)) add(m, { day: Number(m[3]), month: Number(m[2]), year: Number(m[1]) });
  for (const m of text.matchAll(DAY_MONTH)) add(m, { day: Number(m[1]), month: monthNumber(m[2]), year: year(m[3]) });
  for (const m of text.matchAll(MONTH_DAY)) add(m, { day: Number(m[2]), month: monthNumber(m[1]), year: year(m[3]) });
  for (const m of text.matchAll(MONTH_YEAR)) add(m, { day: null, month: monthNumber(m[1]), year: Number(m[2]) });
  return found.sort((a, b) => a.index - b.index).map((f) => f.date);
}

/** A date in the note is backed when an input has the same day and month (and year, when both give one), or the same month and year when the note gives no day. */
function dateBacked(date: WrittenDate, inputDates: WrittenDate[]): boolean {
  return inputDates.some((d) => {
    if (d.month !== date.month) return false;
    if (date.day === null) return date.year !== null && d.year === date.year;
    return d.day === date.day && (date.year === null || d.year === null || d.year === date.year);
  });
}

type DateRole = "opens" | "deadline" | "published";

/** The input's dates by the line they are on: "opens: 8 October 2026 (already open)". */
function datesByRole(inputText: string): Record<DateRole, WrittenDate[]> {
  const roles: Record<DateRole, WrittenDate[]> = { opens: [], deadline: [], published: [] };
  for (const line of inputText.split("\n")) {
    const role = line.match(/^(opens|deadline|published): /)?.[1] as DateRole | undefined;
    if (role) roles[role].push(...datesIn(line));
  }
  return roles;
}

/** The words just before a date in the note that say what the date is. The last one wins: "open until" is a deadline. */
const ROLE_WORDS: [DateRole, RegExp][] = [
  ["opens", /\bopen(?:s|ed|ing)?\b/gi],
  ["deadline", /\b(?:clos(?:e|es|ed|ing)|deadlines?|until|till)\b/gi],
  ["published", /\b(?:publish(?:ed|es)?|announced)\b/gi],
];

/** What the note says a date is, from the 40 characters before it in the same sentence. */
function roleInNote(text: string, date: WrittenDate): DateRole | null {
  let before = text.slice(Math.max(0, date.index - 40), date.index);
  const sentenceStart = Math.max(before.lastIndexOf(". "), before.lastIndexOf("; "));
  if (sentenceStart >= 0) before = before.slice(sentenceStart + 2);
  let best: { role: DateRole; at: number } | null = null;
  for (const [role, words] of ROLE_WORDS) {
    for (const m of before.matchAll(words)) if (!best || m.index > best.at) best = { role, at: m.index };
  }
  return best?.role ?? null;
}

/**
 * Dates the model worked out itself against today, which it gets wrong and
 * which go stale while the note is shown. Months are left alone after "in" or
 * "within": "within 10 months" is how a call words a project's length.
 */
const RELATIVE_TIME =
  /\b(?:(?:this|next|last) (?:month|year|winter|spring|summer|autumn)|(?:next|last) week|(?:in|within) (?:\d+|a|one|two|three|four|five|six|a few) (?:days?|weeks?)|within (?:days|weeks)|\d+ (?:days?|weeks?) (?:left|away|from now))\b/gi;

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const quoteList = (ids: string[]) => (ids.length ? ids.join(", ") : "none");

/** Problems with the note, in words the model can act on. Empty: the note may be stored. */
export function checkNote(draft: TrendDraft, inputs: CheckedInput[]): string[] {
  const problems: string[] = [];
  const title = draft.title.trim();
  const body = draft.body.trim();
  const byId = new Map(inputs.map((input) => [input.id, input]));

  const cited = [...new Set(draft.sources.map((id) => id.trim().toUpperCase()))];
  const unknown = cited.filter((id) => !byId.has(id));
  const known = cited.filter((id) => byId.has(id));
  if (unknown.length) problems.push(`Sources ${quoteList(unknown)} are not inputs. Cite only ${quoteList(inputs.map((i) => i.id))}.`);
  if (known.length < MIN_SOURCES) problems.push(`Cite at least ${MIN_SOURCES} different inputs; the note cites ${known.length}.`);

  if (title.length > TITLE_MAX_CHARS) problems.push(`The title is ${title.length} characters; at most ${TITLE_MAX_CHARS}. Shorten it.`);
  if (title.length < TITLE_MIN_CHARS) problems.push(`The title is ${title.length} characters; at least ${TITLE_MIN_CHARS}. Say what is happening.`);
  if (body.length > BODY_MAX_CHARS) {
    problems.push(`The body is ${body.length} characters; at most ${BODY_MAX_CHARS}. Write it again in two or three short sentences, about 450 characters.`);
  }
  if (body.length < BODY_MIN_CHARS) problems.push(`The body is ${body.length} characters; at least ${BODY_MIN_CHARS}. Write two or three sentences.`);
  const sentences = sentenceCount(body);
  if (sentences < BODY_MIN_SENTENCES || sentences > BODY_MAX_SENTENCES) {
    problems.push(
      `The body has ${sentences} sentence${sentences === 1 ? "" : "s"}; it must have ${BODY_MIN_SENTENCES} to ${BODY_MAX_SENTENCES}. ${sentences < BODY_MIN_SENTENCES ? "End with why it matters to a small tech company in this area." : "Leave inputs out."}`,
    );
  }

  // The note must say what is new: when some inputs are new, at least one cited input is.
  const fresh = inputs.filter((input) => input.fresh).map((input) => input.id);
  if (fresh.length && known.length && !known.some((id) => fresh.includes(id))) {
    problems.push(`The note cites only inputs that are not new (${quoteList(known)}). Write about what is new: ${quoteList(fresh)}.`);
  }

  const text = `${title}\n${body}`;
  // The reader never sees the ids, so "(S2)" in the text is noise.
  const ids = [...new Set(text.match(/\bS\d{1,2}\b/g) ?? [])];
  if (ids.length) problems.push(`The note writes the input ids ${ids.join(", ")}. Leave ids out of the title and body; they go in sources only.`);

  const lower = text.toLowerCase();
  const promises = PROMISE_WORDS.filter((word) => lower.includes(word));
  if (promises.length) {
    problems.push(
      `The note uses ${promises.map((w) => `"${w}"`).join(", ")}. Never say or suggest that anyone is eligible, qualifies, is guaranteed or entitled to anything or will receive it.`,
    );
  }

  const citedText = known.map((id) => byId.get(id)!.text).join("\n");
  const uncited = inputs.filter((input) => !known.includes(input.id));
  const roles = datesByRole(citedText);

  // The model likes "This week sees..." about calls that opened months ago.
  if (/\bthis week\b/i.test(text)) {
    const thisWeek = citedText.split("\n").filter((line) => /\((?:opened )?this week\)$/.test(line)).flatMap((line) => datesIn(line));
    if (!thisWeek.length) {
      problems.push(`The note says "this week", but nothing it cites (${quoteList(known)}) is marked "this week". Say the calls are open and when they close.`);
    } else {
      // "This week, a call closes on 14 January 2027" is wrong; "announced this week that it starts on 1 January 2027" is not.
      // So only a call's own opening or closing date, outside this week, counts against a "this week" sentence.
      const callDates = [...roles.opens, ...roles.deadline];
      const wrong = text
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => /\bthis week\b/i.test(sentence))
        .flatMap((sentence) => datesIn(sentence).filter((d) => d.day !== null && dateBacked(d, callDates) && !dateBacked(d, thisWeek)));
      if (wrong.length) {
        problems.push(`The note says "this week" next to ${wrong.map((d) => `"${d.written}"`).join(", ")}, which is not this week. Keep "this week" for what the inputs mark "this week".`);
      }
    }
  }
  // "Vinnova marine watchdog opens" about a call open since October: only a call that opens this week or later
  // "opens". "It opened on 8 October 2026" is fine: the date says when, and the role check above checks it.
  const openings = [
    ...new Set(
      [...text.matchAll(/\b(?:opens|opened|launch(?:es|ed)?|new calls?)\b/gi)]
        .filter((m) => !datesIn(text.slice(m.index + m[0].length, m.index + m[0].length + 30)).some((d) => d.index <= 8))
        .map((m) => m[0]),
    ),
  ];
  // A call without an opening date may well open now: Energimyndigheten's say "Nu öppnar ansökan" and give no date.
  const openingUnknown = known.some((id) => {
    const own = byId.get(id)!.text;
    return own.startsWith("kind: funding call") && !/^opens: /m.test(own);
  });
  if (openings.length && !openingUnknown && !/\((?:opened this week|not open yet)\)/.test(citedText)) {
    problems.push(
      `The note says ${openings.map((w) => `"${w}"`).join(", ")}, but every input it cites (${quoteList(known)}) was already open before this week. Say the calls are open and when they close.`,
    );
  }

  const analysis = unsupportedAnalysis(text, citedText);
  if (analysis.length) {
    problems.push(
      `The note says ${analysis.map((a) => `"${a}"`).join(", ")}, which no input it cites says. Add no analysis or prediction of your own: say what is new, what it is for and whom it is for, in the inputs' terms.`,
    );
  }

  const relative = [...new Set(text.match(RELATIVE_TIME) ?? [])];
  if (relative.length) {
    problems.push(`The note works out dates itself (${relative.map((r) => `"${r}"`).join(", ")}). Copy the dates the inputs give instead.`);
  }

  const strayFunders = FUNDERS.filter((f) => f.inNote.test(text) && !f.inInput.test(citedText));
  for (const funder of strayFunders) {
    problems.push(`The note names ${funder.name}, but no input it cites (${quoteList(known)}) is from ${funder.name}. Name each call's source as its input gives it.`);
  }
  // "Three EU calls close: the Baltic Marine Watchdog Challenge (Vinnova), ..." counts a Swedish call as an EU one.
  const mixed = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(?:two|three|four|five|six|seven|eight|\d) EU calls\b/i.test(sentence) && /\b(?:Vinnova|Energimyndigheten)\b/i.test(sentence));
  if (mixed.length) {
    problems.push(`A sentence counts "EU calls" but names a Swedish funder: "${mixed[0].slice(0, 120)}". Count only the calls from EU Funding & Tenders as EU calls.`);
  }

  // Years, dates and amounts: each must be in an input the note cites.
  const strayYears = yearsIn(text).filter((year) => !yearsIn(citedText).includes(year));
  if (strayYears.length) problems.push(strayProblem("year", strayYears, known, uncited.filter((input) => strayYears.some((y) => yearsIn(input.text).includes(y)))));

  const citedDates = datesIn(citedText);
  const noteDates = datesIn(text);
  const strayDates = noteDates.filter((date) => !dateBacked(date, citedDates));
  if (strayDates.length) {
    const elsewhere = uncited.filter((input) => strayDates.some((d) => dateBacked(d, datesIn(input.text))));
    problems.push(strayProblem("date", strayDates.map((d) => d.written), known, elsewhere));
  }

  // Every cited call's closing date must be in the note. Without this the model wrote "two calls close on
  // 14 January 2027" for one call closing then and one closing on 16 February 2027, and no check saw it.
  const missingDeadlines = known.flatMap((id) => {
    const deadline = datesByRole(byId.get(id)!.text).deadline[0];
    if (!deadline) return [];
    const said = noteDates.some(
      (n) => n.month === deadline.month && (n.day === null || n.day === deadline.day) && (n.year === null || deadline.year === null || n.year === deadline.year),
    );
    return said ? [] : [`${id} closes on ${deadline.written}`];
  });
  if (missingDeadlines.length) {
    problems.push(`The note does not give every cited call's closing date: ${missingDeadlines.join("; ")}. Give each cited call's own date, or leave the call out of the note and its sources.`);
  }

  // A date the inputs have, put in the wrong role: "opens on 1 December" when 1 December is the deadline.
  for (const date of noteDates) {
    if (date.day === null || strayDates.includes(date)) continue;
    const role = roleInNote(text, date);
    if (!role || dateBacked(date, roles[role])) continue;
    const actual = (Object.keys(roles) as DateRole[]).find((r) => dateBacked(date, roles[r]));
    if (!actual) continue;
    const said = { opens: "opens", deadline: "closes", published: "was published" }[role];
    const is = { opens: "an opening date", deadline: "a closing date", published: "a publish date" }[actual];
    problems.push(`The note says something ${said} on "${date.written}", but in the inputs that is ${is}. Check which date is which.`);
  }

  const citedValues = valuesIn(citedText);
  const strayAmounts = amountsIn(text).filter((amount) => !amount.values.some((v) => citedValues.has(key(v))));
  if (strayAmounts.length) {
    const elsewhere = uncited.filter((input) => {
      const values = valuesIn(input.text);
      return strayAmounts.some((a) => a.values.some((v) => values.has(key(v))));
    });
    problems.push(strayProblem("amount", strayAmounts.map((a) => a.written), known, elsewhere));
  }

  return problems;
}

/** Funders and publishers on the inputs' source lines. A note that names one must cite an input that names it. */
const FUNDERS: { name: string; inNote: RegExp; inInput: RegExp }[] = [
  { name: "the EU", inNote: /\b(?:EU|European Union|European Commission)\b/, inInput: /\bEU\b|\bEurope/i },
  { name: "Vinnova", inNote: /\bVinnova\b/i, inInput: /\bVinnova\b/i },
  { name: "Energimyndigheten", inNote: /\bEnergimyndigheten\b|\bSwedish Energy Agency\b/i, inInput: /\bEnergimyndigheten\b/i },
  { name: "Blue Science Park", inNote: /\bBlue Science Park\b/i, inInput: /\bBlue Science Park\b/i },
];

/** "The date "14 February 2027" is not in ...", with the inputs that do have it, so the retry knows what to cite. */
function strayProblem(kind: string, written: string[], known: string[], elsewhere: CheckedInput[]): string {
  const many = written.length > 1;
  const it = many ? "them" : "it";
  const ids = elsewhere.map((input) => input.id);
  const fix = ids.length
    ? `${ids.join(", ")} ${ids.length > 1 ? "have" : "has"} ${it}: cite ${ids.length > 1 ? "those inputs" : ids[0]} as well, or leave ${it} out.`
    : `No input has ${it}: leave ${it} out, or copy what the inputs say exactly.`;
  return `The ${kind}${many ? "s" : ""} ${written.map((w) => `"${w}"`).join(", ")} ${many ? "are" : "is"} not in the inputs the note cites (${quoteList(known)}). ${fix}`;
}

/** The follow-up message after a note failed its checks. */
export function retryFeedback(problems: string[]): string {
  return `A first draft of this note was rejected:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nWrite the note again from the same inputs, avoiding these mistakes and keeping to every rule.`;
}
