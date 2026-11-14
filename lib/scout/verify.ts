/**
 * Checks on the brief writer's answer (B3), in code, before a brief is
 * stored. Pure functions, so every rule is unit-tested.
 *
 * Per option:
 * - It cites one source by id, that id was shown to the writer, and its URL
 *   was returned by a tool (search or read_page) in this run. No two options
 *   cite the same source.
 * - No eligibility words anywhere (ELIGIBILITY_PHRASES from the judge, plus
 *   a few that only a brief needs), and no source ids in the text.
 * - Every year, date and amount, and every link or email address, is in the
 *   cited source or in the company profile or the question: a brief may only
 *   state what a cited source says.
 * - whyProfile names something the profile itself says (a word that is not
 *   generic), and every field is within its length.
 *
 * Whole brief: a summary within its length and without eligibility words;
 * MIN_OPTIONS to MAX_OPTIONS options. Fewer is allowed only with an "only N
 * found" note, which the run adds itself (agent.ts).
 *
 * These are cheap guards. None can catch a wrong reading of a source, or a
 * requirement the source does not state but that contains no date or amount.
 */
import { ELIGIBILITY_PHRASES } from "../judge/verify";
import { amountsIn, datesIn, yearsIn, type WrittenDate } from "../trends/verify";
import { longDay, MAX_OPEN_QUESTIONS, MAX_REQUIREMENTS, WriterReply, writerSourceText, type WriterOption } from "./prompt";
import { MAX_OPTIONS, MIN_OPTIONS, type SourceRecord } from "./types";

/** The judge's list, plus phrases that would turn a brief option into a promise. */
export const SCOUT_ELIGIBILITY_PHRASES: readonly string[] = [
  ...ELIGIBILITY_PHRASES,
  "meets the requirements",
  "meet the requirements",
  "meets the criteria",
  "meet the criteria",
  "you can apply",
  "is accepted",
  "will be accepted",
];

/** Lengths in characters, after whitespace is collapsed. */
export const OPTION_LIMITS = {
  title: { min: 5, max: 160 },
  whySource: { min: 30, max: 600 },
  whyProfile: { min: 30, max: 450 },
  requirement: { min: 5, max: 400 },
  contactRoute: { min: 5, max: 300 },
  openQuestion: { min: 5, max: 250 },
  summary: { min: 20, max: 600 },
} as const;

/** Words too general to show that whyProfile names something from the profile. */
const GENERIC_WORDS = new Set(
  "about after against along also being between could company company's companies develop develops developed development their there these those which while would should other others offer offers offered provide provides product products service services solution solutions system systems technology technologies technical work works working small business businesses sector market markets field fields option options trial trials opportunity opportunities project projects program programme programs programmes support supports funding facility facilities testing tested test tests where whose within without".split(
    " ",
  ),
);

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export type CheckContext = {
  /** The sources the writer was shown, by id. */
  sources: ReadonlyMap<string, SourceRecord>;
  /** Every URL a tool returned in this run (search hits and pages read). */
  returnedUrls: ReadonlySet<string>;
  companyName: string;
  profileText: string;
  question: string;
  today: Date;
};

export type CheckedOption = { option: WriterOption; source: SourceRecord };
export type FailedOption = { index: number; problems: string[]; previous: WriterOption };
export type CheckedBrief = {
  /** Options that passed, in the writer's order. */
  accepted: CheckedOption[];
  failed: FailedOption[];
  /** Null when the summary failed; the run then writes a plain one (codeSummary). */
  summary: string | null;
  summaryProblems: string[];
  /** Problems with the reply as a whole: not JSON, too many or too few options. */
  problems: string[];
};

export class WriterOutputError extends Error {}

/** The writer's reply as JSON, with or without a code fence around it. */
export function parseWriterReply(reply: string): WriterReply {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  let json: unknown;
  try {
    json = JSON.parse(fenced ? fenced[1] : reply);
  } catch (error) {
    throw new WriterOutputError(`The answer is not one JSON object: ${(error as Error).message.slice(0, 120)}`);
  }
  const parsed = WriterReply.safeParse(json);
  if (!parsed.success) throw new WriterOutputError("The answer does not have the keys options (each with source, title, whySource, whyProfile, requirements, contactRoute, openQuestions) and summary.");
  return parsed.data;
}

/** The first eligibility phrase in the text, or null. */
export function eligibilityPhrase(text: string): string | null {
  const lower = text.toLowerCase();
  return SCOUT_ELIGIBILITY_PHRASES.find((phrase) => lower.includes(phrase)) ?? null;
}

const quoted = (text: string) => JSON.stringify(text.length > 140 ? `${text.slice(0, 137)}...` : text);

function lengthProblem(field: string, text: string, { min, max }: { min: number; max: number }): string | null {
  if (!text) return `"${field}" is empty.`;
  if (text.length < min) return `"${field}" is too short (${text.length} characters; at least ${min}).`;
  if (text.length > max) return `"${field}" is too long (${text.length} characters; at most ${max}).`;
  return null;
}

/** "https://x.se/a." and "x.se/a" compare the same: no scheme, no www, no trailing punctuation or slash. */
const bareUrl = (url: string) =>
  url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[.,;:)\]]+$/, "")
    .replace(/\/+$/, "");

const LINK = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;

/** Links and email addresses in the text. */
export function linksIn(text: string): string[] {
  return [...new Set(text.match(LINK) ?? [])];
}

function dateBacked(date: WrittenDate, known: WrittenDate[]): boolean {
  return known.some((d) => {
    if (d.month !== date.month) return false;
    if (date.day === null) return date.year === null || d.year === null || d.year === date.year;
    return d.day === date.day && (date.year === null || d.year === null || d.year === date.year);
  });
}

const roundKey = (value: number) => String(Math.round(value * 1000) / 1000);

/** Years, dates, amounts and links in `text` that are not in `allowed`. */
export function strayFacts(text: string, allowed: string): string[] {
  const stray: string[] = [];
  const allowedYears = yearsIn(allowed);
  for (const year of yearsIn(text)) if (!allowedYears.includes(year)) stray.push(year);
  const allowedDates = datesIn(allowed);
  for (const date of datesIn(text)) if (!dateBacked(date, allowedDates)) stray.push(date.written);
  const allowedAmounts = new Set(amountsIn(allowed).flatMap((a) => a.values.map(roundKey)));
  for (const amount of amountsIn(text)) if (!amount.values.some((v) => allowedAmounts.has(roundKey(v)))) stray.push(amount.written);
  // A link counts as given when the allowed text has it, with or without scheme, "www." or a trailing slash.
  const allowedLower = allowed.toLowerCase();
  for (const link of linksIn(text)) if (!allowedLower.includes(bareUrl(link))) stray.push(link);
  return [...new Set(stray)];
}

/** Specific words of whyProfile that the profile also uses; empty means it names nothing from the profile. */
export function profileWords(whyProfile: string, profileText: string, companyName: string): string[] {
  const profile = profileText.toLowerCase();
  const name = companyName.toLowerCase();
  const words = whyProfile.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{3,}/gu) ?? [];
  return [...new Set(words.filter((w) => !GENERIC_WORDS.has(w) && !name.includes(w) && profile.includes(w)))];
}

const optionText = (o: WriterOption) => [o.title, o.whySource, o.whyProfile, ...o.requirements, o.contactRoute, ...o.openQuestions].join("\n");

/** The text an option's facts may come from: its source as the writer saw it, the profile, the question and today. */
export function allowedText(source: SourceRecord, context: Pick<CheckContext, "profileText" | "question" | "today">): string {
  return [writerSourceText(source), context.profileText, context.question, `Today is ${longDay(context.today)}.`].join("\n");
}

/** Problems with one option, in words the writer can act on. Empty: the option may be stored. */
export function checkOption(raw: WriterOption, context: CheckContext, usedSources: ReadonlySet<string> = new Set()): string[] {
  const option: WriterOption = {
    source: raw.source.trim().toUpperCase(),
    title: clean(raw.title),
    whySource: clean(raw.whySource),
    whyProfile: clean(raw.whyProfile),
    requirements: raw.requirements.map(clean).filter(Boolean),
    contactRoute: clean(raw.contactRoute),
    openQuestions: raw.openQuestions.map(clean).filter(Boolean),
  };
  const source = context.sources.get(option.source);
  if (!source) return [`"source" is ${quoted(raw.source)}, which is not one of the sources. Cite one of ${[...context.sources.keys()].join(", ")}.`];
  if (!context.returnedUrls.has(source.url)) return [`${option.source} was not returned by a search or a page read in this run, so it cannot be cited.`];
  if (usedSources.has(option.source)) return [`${option.source} is already the source of an earlier option. Every option needs its own source; leave this one out or pick another source.`];

  const problems: (string | null)[] = [
    lengthProblem("title", option.title, OPTION_LIMITS.title),
    lengthProblem("whySource", option.whySource, OPTION_LIMITS.whySource),
    lengthProblem("whyProfile", option.whyProfile, OPTION_LIMITS.whyProfile),
    lengthProblem("contactRoute", option.contactRoute, OPTION_LIMITS.contactRoute),
  ];
  if (option.requirements.length < 1 || option.requirements.length > MAX_REQUIREMENTS) {
    problems.push(`"requirements" has ${option.requirements.length} items; give 1 to ${MAX_REQUIREMENTS}, or the one line saying the source does not state requirements.`);
  }
  for (const item of option.requirements) problems.push(lengthProblem("requirements item", item, OPTION_LIMITS.requirement));
  if (option.openQuestions.length < 1 || option.openQuestions.length > MAX_OPEN_QUESTIONS) {
    problems.push(`"openQuestions" has ${option.openQuestions.length} items; give 1 to ${MAX_OPEN_QUESTIONS}.`);
  }
  for (const item of option.openQuestions) problems.push(lengthProblem("openQuestions item", item, OPTION_LIMITS.openQuestion));

  const text = optionText(option);
  const phrase = eligibilityPhrase(text);
  if (phrase) {
    problems.push(
      `The option uses "${phrase}". Never say or suggest that the company is eligible, qualifies or will receive anything; use no word starting with "eligib" or "qualif" and never "guarantee". For who can take part write "who may apply".`,
    );
  }
  const ids = [...new Set(text.match(/\bR\d{1,2}\b/g) ?? [])];
  if (ids.length) problems.push(`The option writes the ids ${ids.join(", ")} in its text. Ids go in "source" only.`);

  const stray = strayFacts(text, allowedText(source, context));
  if (stray.length) {
    problems.push(
      `${stray.map((s) => quoted(s)).join(", ")} ${stray.length > 1 ? "are" : "is"} not in ${option.source} or the company profile. Write only what the source states, copied as it writes it, or leave ${stray.length > 1 ? "them" : "it"} out.`,
    );
  }
  if (option.whyProfile && !profileWords(option.whyProfile, context.profileText, context.companyName).length) {
    problems.push(`"whyProfile" names nothing the company profile says. Name one product, technology, application area or interest as the profile words it.`);
  }
  return problems.filter((p): p is string => p !== null);
}

/**
 * Two fixed wordings the model kept writing on 2026-11-14 although the prompt
 * forbids them, rewritten before the checks without changing what they say:
 *
 * - "eligible costs" (Vinnova's "stödberättigande kostnader", a cost category
 *   of the call, not a claim about the company) becomes "costs the call covers".
 * - An open question "Whether X qualifies for Y" becomes "Whether X is
 *   covered by Y": it asks, it does not claim.
 *
 * Anything else with "eligib" or "qualif" still fails the option.
 */
export function reword(option: WriterOption): WriterOption {
  const costs = (text: string) =>
    text.replace(/\beligible (costs?|expenses|expenditure|actions?|activities)\b/gi, (_m, what: string) => `${what} the call covers`);
  const question = (text: string) =>
    /^\s*whether\b/i.test(text) ? text.replace(/\bqualifies for\b/gi, "is covered by").replace(/\bqualify for\b/gi, "are covered by") : text;
  return {
    ...option,
    whySource: costs(option.whySource),
    requirements: option.requirements.map(costs),
    openQuestions: option.openQuestions.map((q) => question(costs(q))),
  };
}

/** Checks the whole reply. A reply that is not JSON of the right shape fails as a whole. */
export function checkWriterReply(reply: string, context: CheckContext): CheckedBrief {
  let parsed: WriterReply;
  try {
    parsed = parseWriterReply(reply);
  } catch (error) {
    if (!(error instanceof WriterOutputError)) throw error;
    return { accepted: [], failed: [], summary: null, summaryProblems: [], problems: [error.message] };
  }

  const result: CheckedBrief = { accepted: [], failed: [], summary: null, summaryProblems: [], problems: [] };
  const used = new Set<string>();
  parsed.options.map(reword).forEach((option, index) => {
    const problems = checkOption(option, context, used);
    const id = option.source.trim().toUpperCase();
    if (problems.length) result.failed.push({ index, problems, previous: option });
    else {
      used.add(id);
      result.accepted.push({ option: { ...option, source: id }, source: context.sources.get(id)! });
    }
  });
  if (parsed.options.length > MAX_OPTIONS) result.problems.push(`The brief has ${parsed.options.length} options; at most ${MAX_OPTIONS}.`);
  result.accepted = result.accepted.slice(0, MAX_OPTIONS);

  // The model's summary stands only when every option it wrote passed (else it may describe one that was left
  // out) and its facts are in the kept options' sources. Otherwise the run writes a plain one (codeSummary).
  // A long summary is cut at a sentence end: length is not safety.
  const summary = fitSummary(clean(parsed.summary));
  const summaryProblems = [lengthProblem("summary", summary, OPTION_LIMITS.summary)];
  const phrase = eligibilityPhrase(summary);
  if (phrase) summaryProblems.push(`The summary uses "${phrase}". Say what was found, without promises.`);
  if (/\bR\d{1,2}\b/.test(summary)) summaryProblems.push("The summary writes source ids. Leave them out.");
  const stray = strayFacts(summary, result.accepted.map((a) => allowedText(a.source, context)).join("\n"));
  if (stray.length) summaryProblems.push(`The summary gives ${stray.map((s) => quoted(s)).join(", ")}, which no kept option's source states.`);
  if (result.failed.length) summaryProblems.push("The summary was written with options that failed the checks.");
  const found = summaryProblems.filter((p): p is string => p !== null);
  if (found.length) result.summaryProblems = found;
  else result.summary = summary;

  const usable = Math.min(context.sources.size, MIN_OPTIONS);
  if (result.accepted.length < usable) {
    result.problems.push(`Only ${result.accepted.length} options passed the checks; the brief needs at least ${usable} different sources.`);
  }
  return result;
}

/** The summary, cut after the last whole sentence that fits OPTION_LIMITS.summary.max; unchanged when it fits or no sentence does. */
export function fitSummary(summary: string, max: number = OPTION_LIMITS.summary.max): string {
  if (summary.length <= max) return summary;
  const sentences = summary.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  let kept = "";
  for (const sentence of sentences) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (next.length > max) break;
    kept = next;
  }
  return kept || summary;
}

/** True when enough options passed to store the brief without asking again. A failed summary alone is replaced, not asked for again. */
export const briefPasses = (checked: CheckedBrief, sourceCount: number) => checked.accepted.length >= Math.min(sourceCount, MIN_OPTIONS);

const KIND_WORDS: Record<string, [string, string]> = {
  funding: ["funding call", "funding calls"],
  testbed: ["test facility", "test facilities"],
  event: ["event", "events"],
  news: ["news item", "news items"],
  other: ["web page", "web pages"],
};

const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? ""));

/** A plain summary from the kept options alone: "5 options: 3 test facilities and 2 funding calls, from Vinnova and ...". */
export function codeSummary(options: { kind: string; sourceName: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const o of options) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
  const parts = [...counts].map(([kind, n]) => `${n} ${(KIND_WORDS[kind] ?? KIND_WORDS.other)[n === 1 ? 0 : 1]}`);
  const sources = [...new Set(options.map((o) => o.sourceName).filter((s): s is string => !!s))];
  return `${options.length} option${options.length === 1 ? "" : "s"}: ${listed(parts)}${sources.length ? `, from ${listed(sources)}` : ""}.`;
}

/**
 * The message added to a retry: what was wrong, with each failed option as
 * the model wrote it, and the options that passed, so it keeps them.
 */
export function writerRetryFeedback(checked: CheckedBrief): string {
  const lines = ["Your first answer had problems:"];
  for (const problem of [...checked.problems, ...checked.summaryProblems]) lines.push(`- ${problem}`);
  for (const failed of checked.failed) {
    lines.push(`- Option ${failed.index + 1} (${failed.previous.source}): ${failed.problems.join(" ")}`);
    lines.push(`  It was: ${JSON.stringify(failed.previous)}`);
  }
  if (checked.accepted.length) {
    lines.push(`These options passed; keep them as they are: ${checked.accepted.map((a) => a.option.source).join(", ")}.`);
  }
  lines.push(
    `Answer again with the whole brief. Fix only what the problems name, use other sources where an option cannot be fixed, and check every key once more for words starting with "eligib" or "qualif" and for dates, amounts or links that are not in the source.`,
  );
  return lines.join("\n");
}
