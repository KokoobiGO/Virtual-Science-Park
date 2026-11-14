/**
 * Scout's agent (B3): our own tool loop on NVIDIA's chat API, then one
 * structured call that writes the brief, then the checks in verify.ts.
 *
 * 1. The question itself is searched first, so the model starts from real
 *    results. Every search asks the store, the live sources (the funders' own
 *    search APIs, funding only) and, when a key is set, the web provider, in
 *    parallel, and lists the results in that order (search.ts). The web
 *    provider has its own cap (WEB_SEARCHES_PER_RUN) inside the search cap.
 * 2. The loop: the model calls search, read_page or finish, one model call per
 *    unit of work, up to RESEARCH limits (searches from SCOUT_MAX_SEARCHES,
 *    page reads, turns) and a time budget. read_page takes a result id, so
 *    only pages a search returned in this run can be read.
 * 3. The writer reads the picked sources (finish's candidates, filled up from
 *    the other results) and writes 5 to 10 options. A source can only be
 *    named by an id it was shown; verify.ts checks every option and the run
 *    keeps the ones that pass. When too few pass, the writer is asked once
 *    more with the problems; the better answer is kept. Fewer than
 *    MIN_OPTIONS options get an "only N found" note.
 *
 * `run` wraps every unit of work: the scout-brief job passes step.run, so each
 * model call, search and page read is its own Inngest step (a step may take
 * 30 s at most on Netlify); the script runs them directly. Everything that
 * depends on the clock happens inside a unit, so a replay of the job sees the
 * same decisions. A whole run stays under RUN_BUDGET_MS: no research after
 * loopBudgetMs, no writing after writeBudgetMs, no retry after retryBudgetMs.
 *
 * The backlog names Claude; while we test with NVIDIA's free key it is
 * NVIDIA_MODELS.main with thinking off.
 */
import { NVIDIA_MODELS, NvidiaApiError, nvidiaChat, type ChatMessage, type ChatRequest, type ChatResponse, type ToolCall } from "../nvidia";
import { OpportunityKind } from "../schemas";
import {
  budgetLine,
  buildResearchUserMessage,
  buildWriterUserMessage,
  isoDay,
  KIND_PLURALS,
  longDay,
  loopPageBlock,
  RESEARCH_SYSTEM_PROMPT,
  SCOUT_TOOLS,
  searchResultText,
  sourceId,
  WRITER_SYSTEM_PROMPT,
  writerJsonSchema,
  type WriterOption,
} from "./prompt";
import type { LiveSearch } from "./live-sources";
import { maxSearches, type StoreSearch } from "./search";
import { NO_WEB_KEY, WEB_SEARCHES_PER_RUN, type WebSearchOutcome } from "./web-search";
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  NO_WEB_NOTE,
  type PageRead,
  type ProgressKind,
  type ProgressStep,
  type ScoutBrief,
  type ScoutHit,
  type ScoutOption,
  type SourceRecord,
} from "./types";
import { briefPasses, checkWriterReply, codeSummary, writerRetryFeedback, type CheckContext, type CheckedBrief } from "./verify";

/** Runs one named unit of work. The job passes step.run; the script calls `work` directly. */
export type StepRunner = <T>(name: string, work: () => Promise<T>) => Promise<T>;

export const runDirectly: StepRunner = (_name, work) => work();

export const isRateLimit = (error: unknown) => error instanceof NvidiaApiError && error.status === 429;

/** Netlify cuts a job step off after 30 s; one model call stops before that. */
export const MODEL_TIMEOUT_MS = 26_000;

/** The whole run, from the job's first step to the stored brief (B3). */
export const RUN_BUDGET_MS = 300_000;

export type ScoutLimits = {
  maxSearches: number;
  /** Searches that also ask the keyed web provider. */
  maxWebSearches: number;
  maxPages: number;
  /** Model calls in the research loop. */
  maxTurns: number;
  /** No research model call after this, from the start. */
  loopBudgetMs: number;
  /** No first writer call after this. */
  writeBudgetMs: number;
  /** No second writer call after this: 26 s for the call still ends inside RUN_BUDGET_MS. */
  retryBudgetMs: number;
  /** Sources the writer reads at most. */
  maxWriterSources: number;
};

export function defaultLimits(): ScoutLimits {
  return { maxSearches: maxSearches(), maxWebSearches: WEB_SEARCHES_PER_RUN, maxPages: 3, maxTurns: 7, loopBudgetMs: 165_000, writeBudgetMs: 225_000, retryBudgetMs: 255_000, maxWriterSources: 12 };
}

/** The writer reads at least this many sources when the run found them, so it can leave weak ones out. */
export const WRITER_FILL = 10;

/**
 * The sources the writer reads: the model's picks first, then the other
 * searches' results round-robin by rank (each search's best, then each one's
 * second, ...), so a loop that ran out of turns before finish still gives the
 * writer facilities and funding alike, not only the first search's results.
 */
export function writerPool(picked: SourceRecord[], searchOrder: SourceRecord[][], max: number): SourceRecord[] {
  const pool = [...new Set(picked)];
  const target = Math.min(max, Math.max(WRITER_FILL, pool.length));
  const longest = Math.max(0, ...searchOrder.map((list) => list.length));
  for (let rank = 0; rank < longest && pool.length < target; rank++) {
    for (const list of searchOrder) {
      const source = list[rank];
      if (source && !pool.includes(source) && pool.length < target) pool.push(source);
    }
  }
  return pool.slice(0, max);
}

export type ScoutUsage = { calls: number; inputTokens: number; outputTokens: number };

export type ScoutInput = {
  question: string;
  company: { id: string; slug: string; name: string };
  /** The company's own profile text (lib/embeddings/text.ts personalProfileText). */
  profileText: string;
  /** Epoch ms when the run started: the budget counts from here. From a unit of work, so replays agree. */
  startedAt: number;
  /** When the member asked (the row's createdAt), for the brief. */
  createdAt?: string;
};

type ProgressDraft = { kind: ProgressKind; text: string };

/** The keyed web provider: not asked yet, answered, failed (not asked again), or no key / off. */
type WebState = "untried" | "used" | "unavailable" | "no-key" | "off";

/** What one research model call gave: a reply, no time left, or an API error (a 429 is thrown instead). */
type ModelStep =
  | { kind: "time" }
  | { kind: "error"; message: string }
  | { kind: "reply"; content: string | null; toolCalls: ToolCall[]; usage: ChatResponse["usage"] | null };

type WriteStep =
  | { kind: "time" }
  | { kind: "error"; message: string }
  | { kind: "reply"; reply: string; usage: ChatResponse["usage"] | null; finishReason: string | null };

export type ScoutDeps = {
  run?: StepRunner;
  chat?: (request: ChatRequest, options: { timeoutMs?: number }) => Promise<ChatResponse>;
  searchStore: (query: string, kind?: OpportunityKind) => Promise<StoreSearch>;
  /** The funders' own searches, asked live (live-sources.ts searchLive). Null when off (cached mode). */
  searchLive: ((query: string, kind?: OpportunityKind) => Promise<LiveSearch>) | null;
  /** The keyed web provider (web-search.ts searchWeb). Null when off (cached mode). */
  searchWeb: ((query: string) => Promise<WebSearchOutcome>) | null;
  readPage: (url: string) => Promise<PageRead>;
  /** Called inside a unit of work with the whole progress list so far. */
  saveProgress?: (progress: ProgressStep[]) => Promise<void>;
  /** Called inside the last unit of work. */
  saveDone?: (brief: ScoutBrief, progress: ProgressStep[], searches: number) => Promise<void>;
  saveFailed?: (error: string, progress: ProgressStep[], searches: number) => Promise<void>;
  now?: () => number;
  model?: string;
  limits?: Partial<ScoutLimits>;
};

export type ScoutResult = {
  brief: ScoutBrief | null;
  error: string | null;
  progress: ProgressStep[];
  searches: number;
  pagesRead: number;
  usage: ScoutUsage;
  /** Why the research loop ended. */
  loopEnd: "finish" | "turns" | "time" | "model error" | "no tool call";
  /** Writer calls and how many options each gave and kept. */
  writes: { attempt: number; given: number; accepted: number; problems: string[] }[];
  /** "used" when a live source or the web provider answered at least once. */
  webSearch: "used" | "unavailable";
  /** Why live or web search did not answer, when one did not. */
  webProblem: string | null;
  /** Each live source and web provider that answered, with when it first answered (ISO). */
  liveAnswered: { name: string; at: string }[];
};

const errorText = (error: unknown) => (error instanceof Error ? `${error.name === "Error" ? "" : `${error.name}: `}${error.message}` : String(error)).slice(0, 240);

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const kindArg = (value: unknown): OpportunityKind | undefined => {
  const parsed = OpportunityKind.safeParse(value);
  return parsed.success && parsed.data !== "news" ? parsed.data : undefined;
};

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

const listed = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? ""));

const clockFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "14 November 2026, 10:02", in Swedish time. */
export const dayAndTime = (iso: string) => `${longDay(iso)}, ${clockFormat.format(new Date(iso))}`;

/** The brief's note on what answered live, or null when nothing did (then NO_WEB_NOTE). */
export function liveNote(answered: { name: string; at: string }[]): string | null {
  if (!answered.length) return null;
  return `Searched live during this run: ${listed(answered.map((a) => `${a.name} (answered ${dayAndTime(a.at)})`))}.`;
}

/** The progress line for one live search. */
export function liveLine(query: string, live: LiveSearch): string {
  if (live.skipped) return `Live search not used for "${query}": ${live.skipped}.`;
  const answered = live.sources.filter((s) => s.status === "answered");
  const parts = [`Live search for "${query}": ${answered.length ? answered.map((s) => `${s.name} ${plural(s.results, "result")}`).join(", ") : "no source answered"}`];
  if (live.inStore) parts.push(`${live.inStore} already in the store`);
  for (const s of live.sources) {
    if (s.status === "failed") parts.push(`${s.name} did not answer (${s.error ?? "no reason given"})`);
    if (s.status === "skipped") parts.push(`${s.name} not asked (no specific words to search for)`);
  }
  return `${parts.join("; ")}.`;
}

/** Passed options of the writer's answers in order, one per source, at most MAX_OPTIONS. */
export function mergeAccepted(answers: CheckedBrief[]): CheckedBrief["accepted"] {
  const kept: CheckedBrief["accepted"] = [];
  for (const answer of answers) {
    for (const item of answer.accepted) {
      if (kept.length < MAX_OPTIONS && !kept.some((k) => k.source.id === item.source.id)) kept.push(item);
    }
  }
  return kept;
}

/** The stored option: the writer's text, the citation from the run's own record of the source. */
export function toScoutOption(option: WriterOption, source: SourceRecord): ScoutOption {
  const tidy = (items: string[]) => [...new Set(items.map(collapse).filter(Boolean))];
  return {
    title: collapse(option.title),
    kind: source.kind ?? "other",
    whyProfile: collapse(option.whyProfile),
    whySource: collapse(option.whySource),
    requirements: tidy(option.requirements),
    contactRoute: collapse(option.contactRoute),
    openQuestions: tidy(option.openQuestions),
    citation: {
      url: source.url,
      title: source.title,
      retrievedAt: isoDay(source.page?.retrievedAt ?? source.retrievedAt),
      origin: source.origin,
      sourceName: source.sourceName ?? null,
      pageRead: source.page !== null,
      // The data status of the cited source (D20): hand-entered, or read from a cached copy.
      simulated: source.simulated ?? false,
      sourceState: source.sourceState ?? null,
      sourceCachedAt: source.sourceCachedAt ?? null,
      pageStored: source.page?.stored === true,
      // A live or web result: which search returned it and when, so the page can say "live result, retrieved <time>".
      liveSource: source.origin === "store" ? null : (source.liveSource ?? null),
      liveRetrievedAt: source.origin === "store" ? null : source.retrievedAt,
      injection: source.injection ?? null,
    },
    opportunityId: source.opportunityId ?? null,
    deadline: source.deadline ?? source.eventDate ?? null,
  };
}

export async function runScout(input: ScoutInput, deps: ScoutDeps): Promise<ScoutResult> {
  const run = deps.run ?? runDirectly;
  const chat = deps.chat ?? nvidiaChat;
  const now = deps.now ?? Date.now;
  const model = deps.model ?? NVIDIA_MODELS.main;
  const limits = { ...defaultLimits(), ...deps.limits };
  const today = new Date(input.startedAt);

  const progress: ProgressStep[] = [];
  let loopEnd: ScoutResult["loopEnd"] = "turns";
  const writes: ScoutResult["writes"] = [];
  const usage: ScoutUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const byUrl = new Map<string, SourceRecord>();
  const byId = new Map<string, SourceRecord>();
  /** Every URL a tool returned in this run: hits, and the address a page ended at. */
  const returnedUrls = new Set<string>();
  let searches = 0;
  let pagesRead = 0;
  /**
   * What live and web search did so far, changed only from units' outputs, so a replay of the job sees the same.
   * In an object: TypeScript would otherwise keep the narrowed first value of a variable that only closures change.
   */
  const state: {
    web: WebState;
    webSearches: number;
    webProblem: string | null;
    /** Live source or web provider name -> when it first answered. */
    answered: Map<string, string>;
    /** Live source name -> its last failure, while it has never answered. */
    liveFailed: Map<string, string>;
    capSaid: boolean;
  } = {
    web: deps.searchWeb ? "untried" : "off",
    webSearches: 0,
    webProblem: null,
    answered: new Map(),
    liveFailed: new Map(),
    capSaid: false,
  };
  const liveOff = !deps.searchLive && !deps.searchWeb;
  /** Lines to save with the next unit of work, from decisions made outside one. */
  let pending: ProgressDraft[] = [];

  /** One unit of work that also stores the progress lines it adds. */
  const unit = async <T>(name: string, work: () => Promise<{ value: T; progress: ProgressDraft[] }>): Promise<T> => {
    const before = progress.slice();
    const carried = pending;
    pending = [];
    const out = await run(name, async () => {
      const result = await work();
      const at = new Date(now()).toISOString();
      const entries = [...carried, ...result.progress].map((p) => ({ ...p, at }));
      if (entries.length) await deps.saveProgress?.([...before, ...entries]);
      return { value: result.value, entries };
    });
    progress.push(...out.entries);
    return out.value;
  };

  const addUsage = (u: ChatResponse["usage"] | undefined) => {
    usage.calls++;
    usage.inputTokens += u?.prompt_tokens ?? 0;
    usage.outputTokens += u?.completion_tokens ?? 0;
  };

  /** Each search's results in the order it ranked them, for filling the writer's sources. */
  const searchOrder: SourceRecord[][] = [];

  /** New hits get the next ids; a URL seen before keeps its id. */
  const register = (hits: ScoutHit[]) => {
    const fresh: SourceRecord[] = [];
    const repeated: SourceRecord[] = [];
    const ranked: SourceRecord[] = [];
    for (const hit of hits) {
      returnedUrls.add(hit.url);
      const known = byUrl.get(hit.url);
      if (known) {
        if (!repeated.includes(known) && !fresh.includes(known)) repeated.push(known);
        if (!ranked.includes(known)) ranked.push(known);
        continue;
      }
      const record: SourceRecord = { ...hit, id: sourceId(byId.size), page: null };
      byUrl.set(hit.url, record);
      byId.set(record.id, record);
      fresh.push(record);
      ranked.push(record);
    }
    searchOrder.push(ranked);
    return { fresh, repeated };
  };

  /**
   * One search: the store, the live sources and the keyed web provider in parallel, listed in that order.
   * A live or web failure is a progress line; the search goes on with what answered. Returns the tool message text.
   */
  const search = async (query: string, kind: OpportunityKind | undefined): Promise<string> => {
    searches++;
    const tryLive = deps.searchLive !== null;
    const webOpen = state.web === "untried" || state.web === "used";
    const tryWeb = deps.searchWeb !== null && webOpen && state.webSearches < limits.maxWebSearches;
    const sayCap = deps.searchWeb !== null && webOpen && !tryWeb && !state.capSaid;
    const out = await unit(`search ${searches}`, async () => {
      const [store, live, web] = await Promise.all([
        deps.searchStore(query, kind),
        tryLive ? deps.searchLive!(query, kind).catch((error): LiveSearch => ({ hits: [], sources: [{ name: "Live search", status: "failed", results: 0, at: new Date(now()).toISOString(), error: errorText(error) }], inStore: 0, flagged: 0 })) : null,
        tryWeb ? deps.searchWeb!(query).catch((error): WebSearchOutcome => ({ status: "failed", provider: "Web search", error: errorText(error) })) : null,
      ]);
      const lines: ProgressDraft[] = [
        {
          kind: "search",
          text: `Searched stored opportunities for "${query}"${kind ? ` (${KIND_PLURALS[kind]} only)` : ""}: ${plural(store.hits.length, "result")}${store.method === "keywords" ? " by keywords, because the embedding service did not answer" : ""}.`,
        },
      ];
      if (live) lines.push({ kind: "web", text: liveLine(query, live) });
      if (web?.status === "no-key") lines.push({ kind: "web", text: `General web search is off: ${NO_WEB_KEY} (TAVILY_API_KEY or BRAVE_SEARCH_API_KEY).` });
      if (web?.status === "answered") {
        lines.push({ kind: "web", text: `${web.provider} on trusted sites for "${query}": ${plural(web.hits.length, "result")}${web.inStore ? ` (${web.inStore} already in the store)` : ""}.` });
      }
      if (web?.status === "failed") lines.push({ kind: "web", text: `${web.provider} did not answer (${web.error}); going on without it.` });
      if (sayCap) lines.push({ kind: "web", text: `The ${limits.maxWebSearches} web searches of this brief are used; going on with stored and live sources.` });
      const flagged = (live?.flagged ?? 0) + (web?.status === "answered" ? web.flagged : 0);
      if (flagged) lines.push({ kind: "web", text: `${plural(flagged, "result")} ${flagged === 1 ? "contains" : "contain"} text that looks like instructions to an AI; it was treated as data.` });
      return { value: { store: store.hits, live, web }, progress: lines };
    });

    if (sayCap) state.capSaid = true;
    for (const source of out.live?.sources ?? []) {
      if (source.status === "answered") {
        if (!state.answered.has(source.name)) state.answered.set(source.name, source.at);
        state.liveFailed.delete(source.name);
      } else if (source.status === "failed" && !state.answered.has(source.name)) state.liveFailed.set(source.name, source.error ?? "no answer");
    }
    if (out.web) {
      if (out.web.status === "no-key") {
        state.web = "no-key";
        state.webProblem = NO_WEB_KEY;
      } else {
        state.webSearches++;
        if (out.web.status === "answered") {
          state.web = "used";
          if (!state.answered.has(out.web.provider)) state.answered.set(out.web.provider, out.web.at);
        } else {
          state.web = "unavailable";
          state.webProblem = `${out.web.provider}: ${out.web.error}`;
        }
      }
    }

    const liveHits = out.live?.hits ?? [];
    const webHits = out.web?.status === "answered" ? out.web.hits : [];
    const { fresh, repeated } = register([...out.store, ...liveHits, ...webHits]);
    const outsideTried = (out.live && !out.live.skipped) || (out.web && out.web.status !== "no-key");
    const outsideAnswered = out.live?.sources.some((s) => s.status === "answered") || out.web?.status === "answered";
    const webNote = outsideTried && !outsideAnswered ? "The live sources did not answer this search; these results are from the store only." : null;
    return searchResultText({ query, fresh, repeated, webNote });
  };

  /** Why nothing live answered, for ScoutResult.webProblem; null when something did. */
  const outsideProblem = (): string | null => {
    const problems = [...[...state.liveFailed].map(([name, error]) => `${name}: ${error}`), ...(state.webProblem ? [state.webProblem] : [])];
    if (liveOff) return "Live and web search are off (DEMO_MODE=cached).";
    return problems.length ? problems.join("; ").slice(0, 400) : null;
  };
  const liveAnswered = () => [...state.answered].map(([name, at]) => ({ name, at }));

  /** One page read, by result id. Returns the tool message text. */
  const readPage = async (source: SourceRecord): Promise<string> => {
    pagesRead++;
    const out = await unit<{ page: PageRead | null; error: string | null }>(`read ${pagesRead}`, async () => {
      try {
        const page = await deps.readPage(source.url);
        const what = page.stored ? `the stored copy (${isoDay(page.retrievedAt)}) of the page of` : "the page of";
        return { value: { page, error: null }, progress: [{ kind: "read" as const, text: `Read ${what} "${source.title.slice(0, 80)}" (${page.chars.toLocaleString("en")} characters).` }] };
      } catch (error) {
        const message = errorText(error);
        return { value: { page: null, error: message }, progress: [{ kind: "read" as const, text: `Could not read the page of "${source.title.slice(0, 80)}": ${message}` }] };
      }
    });
    if (!out.page) return `Could not read the page of ${source.id}: ${out.error}`;
    source.page = out.page;
    returnedUrls.add(out.page.url);
    return loopPageBlock(source);
  };

  const fail = async (error: string): Promise<ScoutResult> => {
    const carried = pending;
    pending = [];
    const before = progress.slice();
    const lines = await run("store failure", async () => {
      const at = new Date(now()).toISOString();
      const entries = [...carried, { kind: "error" as const, text: error }].map((p) => ({ ...p, at }));
      await deps.saveFailed?.(error, [...before, ...entries], searches);
      return entries;
    });
    progress.push(...lines);
    return {
      brief: null,
      error,
      progress,
      searches,
      pagesRead,
      usage,
      loopEnd,
      writes,
      webSearch: state.answered.size ? "used" : "unavailable",
      webProblem: outsideProblem(),
      liveAnswered: liveAnswered(),
    };
  };

  // 1. The question itself.
  pending.push({ kind: "start", text: `Started. Read ${input.company.name}'s profile (${input.profileText.length.toLocaleString("en")} characters).` });
  const firstSearch = await search(collapse(input.question).slice(0, 300), undefined);

  // 2. The research loop.
  const messages: ChatMessage[] = [
    { role: "system", content: RESEARCH_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildResearchUserMessage({
        question: input.question,
        companyName: input.company.name,
        profileText: input.profileText,
        today,
        maxSearches: limits.maxSearches,
        maxPages: limits.maxPages,
        firstSearch: `${firstSearch}\n${budgetLine(limits.maxSearches - searches, limits.maxPages - pagesRead, byId.size)}`,
      }),
    },
  ];
  let candidates: string[] = [];
  let nudged = false;

  for (let turn = 1; turn <= limits.maxTurns; turn++) {
    const asked = [...messages];
    const reply = await unit<ModelStep>(`model ${turn}`, async () => {
      if (now() - input.startedAt > limits.loopBudgetMs) {
        return { value: { kind: "time" as const }, progress: [{ kind: "plan" as const, text: "Research time is up; writing the brief from what was found." }] };
      }
      try {
        const response = await chat(
          { model, max_tokens: 700, temperature: 0, messages: asked, tools: SCOUT_TOOLS, tool_choice: "auto", chat_template_kwargs: { enable_thinking: false } },
          { timeoutMs: MODEL_TIMEOUT_MS },
        );
        const message = response.choices[0]?.message;
        return {
          value: { kind: "reply" as const, content: message?.content ?? null, toolCalls: message?.tool_calls ?? [], usage: response.usage ?? null },
          progress: [],
        };
      } catch (error) {
        if (isRateLimit(error)) throw error;
        return {
          value: { kind: "error" as const, message: errorText(error) },
          progress: [{ kind: "plan" as const, text: `A model call failed (${errorText(error)}); writing the brief from what was found.` }],
        };
      }
    });
    if (reply.kind === "time") {
      loopEnd = "time";
      break;
    }
    if (reply.kind === "error") {
      loopEnd = "model error";
      break;
    }
    addUsage(reply.usage ?? undefined);

    const calls: ToolCall[] = reply.toolCalls;
    if (!calls.length) {
      if (nudged) {
        loopEnd = "no tool call";
        break;
      }
      nudged = true;
      messages.push({ role: "assistant", content: reply.content ?? "" });
      messages.push({ role: "user", content: "Call one of the tools: search, read_page or finish." });
      continue;
    }

    messages.push({ role: "assistant", content: reply.content, tool_calls: calls });
    let finished = false;
    for (const call of calls) {
      const args = parseArgs(call.function.arguments);
      let content: string;
      if (finished) content = "Ignored: finish was already called.";
      else if (call.function.name === "finish") {
        const ids = Array.isArray(args.candidates) ? args.candidates.map((id) => String(id).trim().toUpperCase()) : [];
        candidates = [...new Set(ids.filter((id) => byId.has(id)))];
        finished = true;
        content = "Noted.";
        pending.push({ kind: "plan", text: `Picked ${plural(candidates.length, "candidate")} out of ${plural(byId.size, "result")}.` });
      } else if (call.function.name === "search") {
        const query = typeof args.query === "string" ? collapse(args.query).slice(0, 200) : "";
        if (!query) content = "The search needs a query.";
        else if (searches >= limits.maxSearches) content = "No searches left. Read a page or call finish.";
        else content = await search(query, kindArg(args.kind));
      } else if (call.function.name === "read_page") {
        const id = typeof args.id === "string" ? args.id.trim().toUpperCase() : "";
        const source = byId.get(id);
        if (!source) content = `There is no result "${id}". Use an id from the results.`;
        else if (source.page) content = `${id} was read already.`;
        else if (pagesRead >= limits.maxPages) content = "No page reads left. Search again or call finish.";
        else content = await readPage(source);
      } else content = `There is no tool "${call.function.name}". Use search, read_page or finish.`;
      if (!finished) content = `${content}\n${budgetLine(limits.maxSearches - searches, limits.maxPages - pagesRead, byId.size)}`;
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
    if (finished) {
      loopEnd = "finish";
      break;
    }
  }

  // 3. The writer.
  if (!byId.size) return fail("No funding calls, test facilities or events were found for this question.");
  const sources = writerPool(candidates.map((id) => byId.get(id)!), searchOrder, limits.maxWriterSources);
  const ids = sources.map((s) => s.id);
  const context: CheckContext = {
    sources: new Map(sources.map((s) => [s.id, s])),
    returnedUrls,
    companyName: input.company.name,
    profileText: input.profileText,
    question: input.question,
    today,
  };
  if (loopEnd !== "finish" && loopEnd !== "time") pending.push({ kind: "plan", text: `Research ended (${loopEnd}).` });

  const write = (attempt: number, feedback?: string) =>
    unit<WriteStep>(`write ${attempt}`, async () => {
      const budget = attempt === 1 ? limits.writeBudgetMs : limits.retryBudgetMs;
      if (now() - input.startedAt > budget) {
        return { value: { kind: "time" as const }, progress: [{ kind: "write" as const, text: attempt === 1 ? "No time left to write the brief." : "No time left to ask the writer again." }] };
      }
      const intro: ProgressDraft = { kind: "write", text: attempt === 1 ? `Writing the brief from ${plural(sources.length, "source")}.` : "Asking the writer again with the problems." };
      try {
        const response = await chat(
          {
            model,
            max_tokens: 4000,
            // A retry at 0 tends to repeat the same words; a little variation gets it out.
            temperature: attempt === 1 ? 0 : 0.2,
            messages: [
              { role: "system", content: WRITER_SYSTEM_PROMPT },
              { role: "user", content: buildWriterUserMessage({ question: input.question, companyName: input.company.name, profileText: input.profileText, today, sources, feedback }) },
            ],
            response_format: { type: "json_schema", json_schema: { name: "scout_brief", schema: writerJsonSchema(ids), strict: true } },
            chat_template_kwargs: { enable_thinking: false },
          },
          { timeoutMs: MODEL_TIMEOUT_MS },
        );
        const reply = response.choices[0]?.message.content?.trim() ?? "";
        const checked = checkWriterReply(reply, context);
        const given = checked.accepted.length + checked.failed.length;
        return {
          value: { kind: "reply" as const, reply, usage: response.usage ?? null, finishReason: response.choices[0]?.finish_reason ?? null },
          progress: [
            intro,
            {
              kind: "check" as const,
              text: `Checked the brief: ${checked.accepted.length} of ${plural(given, "option")} passed${checked.failed.length ? `; left out ${checked.failed.length} (${checked.failed.map((f) => f.problems[0]).join(" / ").slice(0, 300)})` : ""}.`,
            },
          ],
        };
      } catch (error) {
        if (isRateLimit(error)) throw error;
        return { value: { kind: "error" as const, message: errorText(error) }, progress: [intro, { kind: "write" as const, text: `The writer call failed: ${errorText(error)}` }] };
      }
    });

  const attempts: { checked: CheckedBrief }[] = [];
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const previous = attempts.at(-1)?.checked;
    const out = await write(attempt, previous ? writerRetryFeedback(previous) : undefined);
    if (out.kind === "time") break;
    if (out.kind === "error") {
      lastError = out.message;
      continue;
    }
    addUsage(out.usage ?? undefined);
    const checked = checkWriterReply(out.reply, context);
    attempts.push({ checked });
    writes.push({
      attempt,
      given: checked.accepted.length + checked.failed.length,
      accepted: checked.accepted.length,
      problems: [...checked.problems, ...checked.summaryProblems, ...checked.failed.flatMap((f) => f.problems)].slice(0, 12),
    });
    if (briefPasses(checked, sources.length)) break;
  }
  if (!attempts.length) return fail(lastError ? `The brief could not be written: ${lastError}` : "There was no time left to write the brief.");

  // The answer with more options that passed comes first (on a tie, the later one); options from the other
  // answer on sources not used yet fill up to MAX_OPTIONS. Every kept option passed every check on its own.
  const ordered = attempts.length === 2 && attempts[0].checked.accepted.length > attempts[1].checked.accepted.length ? attempts : [...attempts].reverse();
  const best = ordered[0].checked;
  const kept = mergeAccepted(ordered.map((a) => a.checked));
  if (!kept.length) return fail("No option passed the checks, so no brief was stored.");
  const options = kept.map(({ option, source }) => toScoutOption(option, source));
  // The writer's summary only when its answer is used whole; otherwise a plain one from the kept options.
  const summary = (kept.length === best.accepted.length ? best.summary : null) ?? codeSummary(options.map((o) => ({ kind: o.kind, sourceName: o.citation.sourceName })));
  const notes: string[] = [];
  // Which live sources answered and when; "built from stored sources" only when none did.
  notes.push(liveNote(liveAnswered()) ?? NO_WEB_NOTE);
  const neverAnswered = [...state.liveFailed.keys()];
  if (neverAnswered.length) notes.push(`${listed(neverAnswered)} did not answer during this run.`);
  const onlyFound = options.length < MIN_OPTIONS ? options.length : null;
  if (onlyFound !== null) notes.push(`Only ${plural(onlyFound, "option")} found that fit the question and passed the checks.`);
  const dropped = best.failed.length;

  const brief = await unit("store brief", async () => {
    const finishedAt = now();
    const result: ScoutBrief = {
      question: input.question,
      summary,
      options,
      notes,
      onlyFound,
      webSearch: state.answered.size ? "used" : "unavailable",
      stats: {
        seconds: Math.round((finishedAt - input.startedAt) / 1000),
        modelCalls: usage.calls,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        searches,
        pagesRead,
        dropped,
        model,
      },
      createdAt: input.createdAt ?? new Date(input.startedAt).toISOString(),
    };
    const done: ProgressDraft = {
      kind: "done",
      text: `Done in ${result.stats.seconds} s: ${plural(options.length, "option")}, ${plural(usage.calls, "model call")}, ${plural(searches, "search", "searches")}, ${plural(pagesRead, "page")} read.`,
    };
    const at = new Date(finishedAt).toISOString();
    await deps.saveDone?.(result, [...progress, { ...done, at }], searches);
    return { value: { result, at, done }, progress: [] };
  });
  progress.push({ ...brief.done, at: brief.at });
  return {
    brief: brief.result,
    error: null,
    progress,
    searches,
    pagesRead,
    usage,
    loopEnd,
    writes,
    webSearch: brief.result.webSearch,
    webProblem: outsideProblem(),
    liveAnswered: liveAnswered(),
  };
}
