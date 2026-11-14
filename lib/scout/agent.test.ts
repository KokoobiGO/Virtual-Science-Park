import { describe, expect, it } from "vitest";
import { INJECTION_LABEL } from "../injection/detect";
import { NvidiaApiError, type ChatRequest, type ChatResponse } from "../nvidia";
import { runScout, type ScoutDeps } from "./agent";
import type { LiveSearch, LiveSourceReport } from "./live-sources";
import type { StoreSearch } from "./search";
import { NO_WEB_NOTE, type ProgressStep, type ScoutHit } from "./types";

const START = Date.parse("2026-11-14T09:00:00Z");

const PROFILE = [
  "EmbeddedArt",
  "Offerings: UV-sensors and technical systems for maritime surveillance, monitoring and marine measurement stations",
  "Technologies: product development, hydroacoustics, sensor systems",
  "Interests: Underwater test ranges for sensor trials in spring 2027",
].join("\n");

function hit(n: number, extra: Partial<ScoutHit> = {}): ScoutHit {
  return {
    title: `Facility ${n}`,
    url: `https://example.se/facility-${n}`,
    snippet: `Test facility ${n} for underwater sensors.`,
    description: `Test facility ${n} offers sea trials of underwater sensors and hydroacoustic equipment. Contact the lab manager.`,
    origin: "store",
    retrievedAt: "2026-11-10T03:00:00Z",
    opportunityId: `00000000-0000-4000-8000-00000000000${n}`,
    kind: "testbed",
    sourceName: "Curated testbed list",
    deadline: null,
    eventDate: null,
    contact: null,
    eligibilityText: null,
    ...extra,
  };
}

const EU_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL3-2027-01-BM-04";

/** A live EU topic the store does not have. */
function euHit(extra: Partial<ScoutHit> = {}): ScoutHit {
  return {
    title: "Maritime surveillance sensor networks",
    url: EU_URL,
    snippet: "Research on sensor networks for maritime surveillance.",
    description: "Projects develop sensor networks and hydroacoustic sensors for maritime surveillance of critical infrastructure at sea.",
    origin: "live",
    retrievedAt: "2026-11-14T09:00:05.000Z",
    opportunityId: null,
    kind: "funding",
    sourceName: "EU Funding & Tenders",
    liveSource: "EU Funding & Tenders portal",
    externalId: "HORIZON-CL3-2027-01-BM-04",
    // 31 March 2027, 23:59 Swedish summer time.
    deadline: "2027-03-31T21:59:00.000Z",
    injection: null,
    ...extra,
  };
}

const liveAnswer = (hits: ScoutHit[]): LiveSearch => ({
  hits,
  sources: [{ name: "EU Funding & Tenders portal", status: "answered", results: hits.length, at: "2026-11-14T09:00:05.000Z" }],
  inStore: 0,
  flagged: 0,
});

const failed = (name: string, error: string): LiveSourceReport => ({ name, status: "failed", results: 0, at: "2026-11-14T09:00:08.000Z", error });

const liveOption = (source: string, extra: Record<string, unknown> = {}) => ({
  source,
  title: "EU call for maritime surveillance sensor networks",
  whySource: "The EU funds sensor networks and hydroacoustic sensors for maritime surveillance at sea.",
  whyProfile: "EmbeddedArt's hydroacoustics and maritime surveillance systems could be part of such a network.",
  requirements: ["The source does not state requirements."],
  contactRoute: "No contact is given; use the cited page.",
  openQuestions: ["Whether a single company may apply without partners."],
  ...extra,
});

const toolCall = (id: string, name: string, args: Record<string, unknown>) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });

const reply = (message: Partial<ChatResponse["choices"][number]["message"]>): ChatResponse => ({
  model: "fake",
  choices: [{ finish_reason: "stop", message: { role: "assistant", content: null, ...message } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
});

function option(source: string, n: number, extra: Record<string, unknown> = {}) {
  return {
    source,
    title: `Facility ${n} sea trials`,
    whySource: `Facility ${n} offers sea trials of underwater sensors and hydroacoustic equipment.`,
    whyProfile: "EmbeddedArt's hydroacoustics and sensor systems could be trialled there.",
    requirements: ["The source does not state requirements."],
    contactRoute: "Contact the lab manager through the cited page.",
    openQuestions: ["Whether the facility takes outside companies."],
    ...extra,
  };
}

/** A fake chat: research replies in order, then writer replies in order. */
function fakeChat(research: ChatResponse[], writer: (string | Error)[]) {
  const requests: ChatRequest[] = [];
  const chat = async (request: ChatRequest) => {
    requests.push(request);
    if (request.response_format) {
      const next = writer.shift();
      if (next === undefined) throw new Error("no writer reply left");
      if (next instanceof Error) throw next;
      return reply({ content: next });
    }
    const next = research.shift();
    if (!next) throw new Error("no research reply left");
    return next;
  };
  return { chat, requests };
}

function deps(overrides: Partial<ScoutDeps> & { hits?: ScoutHit[][] } = {}): ScoutDeps & { saved: ProgressStep[][]; queries: string[] } {
  const batches = overrides.hits ?? [[hit(1), hit(2), hit(3)], [hit(4), hit(5), hit(6), hit(1)]];
  const queries: string[] = [];
  const saved: ProgressStep[][] = [];
  let clock = START;
  return {
    searchStore: async (query): Promise<StoreSearch> => {
      queries.push(query);
      return { hits: batches.shift() ?? [], method: "embedding" };
    },
    searchLive: null,
    searchWeb: null,
    readPage: async (url) => ({ url, title: "Page", text: "Sea trials at 40 m depth. Contact: lab@example.se.", retrievedAt: "2026-11-14T09:01:00Z", chars: 52 }),
    saveProgress: async (progress) => {
      saved.push(progress);
    },
    now: () => (clock += 1000),
    saved,
    queries,
    ...overrides,
  };
}

const input = { question: "Which test facilities could fit an underwater sensor trial?", company: { id: "c1", slug: "embeddedart", name: "EmbeddedArt" }, profileText: PROFILE, startedAt: START };

describe("runScout", () => {
  it("searches, reads, finishes and stores a checked brief citing only returned sources", async () => {
    const goodBrief = JSON.stringify({
      options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)),
      summary: "Five test facilities offer sea trials for underwater sensors.",
    });
    const { chat, requests } = fakeChat(
      [
        reply({ tool_calls: [toolCall("c1", "search", { query: "hydroacoustic test range", kind: "testbed" })] }),
        reply({ tool_calls: [toolCall("c2", "read_page", { id: "R2" })] }),
        reply({ tool_calls: [toolCall("c3", "finish", { candidates: ["R2", "R1", "R4", "R9"] })] }),
      ],
      [goodBrief],
    );
    const d = deps({ chat });
    let done: { optionCount: number; searches: number } | null = null;
    d.saveDone = async (brief, _progress, searches) => {
      done = { optionCount: brief.options.length, searches };
    };
    const result = await runScout(input, d);

    expect(result.error).toBeNull();
    expect(result.brief?.options).toHaveLength(5);
    expect(result.loopEnd).toBe("finish");
    expect(result.searches).toBe(2);
    expect(result.pagesRead).toBe(1);
    expect(d.queries).toEqual([input.question, "hydroacoustic test range"]);
    expect(done).toEqual({ optionCount: 5, searches: 2 });
    // Every citation is a URL a search returned.
    for (const o of result.brief!.options) expect(o.citation.url).toMatch(/^https:\/\/example\.se\/facility-\d$/);
    expect(result.brief!.options[1].citation.pageRead).toBe(true);
    expect(result.brief!.notes).toContain(NO_WEB_NOTE);
    expect(result.brief!.webSearch).toBe("unavailable");
    expect(result.usage.calls).toBe(4);
    // Thinking off, and the writer may only name ids it was shown.
    expect(requests.every((r) => r.chat_template_kwargs?.enable_thinking === false)).toBe(true);
    const writerSchema = JSON.stringify(requests.at(-1)!.response_format);
    expect(writerSchema).toContain('"enum":["R2","R1","R4","R5","R3","R6"]');
    // Progress is saved as it goes and ends with "done".
    expect(d.saved.length).toBeGreaterThan(3);
    expect(result.progress.at(-1)?.kind).toBe("done");
    // A repeated hit keeps its first id.
    expect(requests[1].messages.some((m) => m.role === "tool" && m.content.includes("Seen before: R1"))).toBe(true);
  });

  it("records each citation's data status, and a page read from a stored copy (D20)", async () => {
    const goodBrief = JSON.stringify({ options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)), summary: "Five test facilities offer sea trials for underwater sensors." });
    const { chat } = fakeChat(
      [reply({ tool_calls: [toolCall("c1", "read_page", { id: "R2" })] }), reply({ tool_calls: [toolCall("c2", "finish", { candidates: ["R1", "R2"] })] })],
      [goodBrief],
    );
    const hits = [
      [
        hit(1, { simulated: true, sourceState: "simulated" }),
        hit(2, { simulated: false, sourceState: "cached", sourceCachedAt: "2026-11-09T02:00:00.000Z" }),
        hit(3, { simulated: false, sourceState: "live" }),
        hit(4),
        hit(5),
      ],
    ];
    const stored = async (url: string) => ({ url, title: "Page", text: "Sea trials at 40 m depth. Contact: lab@example.se.", retrievedAt: "2026-11-08T03:00:00Z", chars: 52, stored: true });
    const result = await runScout(input, deps({ chat, hits, readPage: stored }));

    const byUrl = new Map(result.brief!.options.map((o) => [o.citation.url.slice(-1), o.citation]));
    expect(byUrl.get("1")).toMatchObject({ simulated: true, sourceState: "simulated", pageRead: false, pageStored: false });
    expect(byUrl.get("2")).toMatchObject({ sourceState: "cached", sourceCachedAt: "2026-11-09T02:00:00.000Z", pageRead: true, pageStored: true, retrievedAt: "2026-11-08" });
    expect(byUrl.get("3")).toMatchObject({ simulated: false, sourceState: "live" });
    // A hit without the fields (an older job's step output) counts as read live.
    expect(byUrl.get("4")).toMatchObject({ simulated: false, sourceState: null, sourceCachedAt: null });
    expect(result.progress.some((p) => p.kind === "read" && p.text.startsWith('Read the stored copy (2026-11-08) of the page of "Facility 2"'))).toBe(true);
  });

  it("asks the writer again when too few options pass, and keeps the better answer", async () => {
    const bad = JSON.stringify({
      options: [option("R1", 1, { whyProfile: "EmbeddedArt is eligible for this test range and its sensor systems fit." }), option("R2", 2)],
      summary: "Two facilities.",
    });
    const fixed = JSON.stringify({ options: [1, 2, 3, 4, 5, 6].map((n) => option(`R${n}`, n)), summary: "Six test facilities offer sea trials for underwater sensors." });
    const { chat, requests } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: [] })] })], [bad, fixed]);
    const result = await runScout(input, deps({ chat, hits: [[1, 2, 3, 4, 5, 6].map((n) => hit(n))] }));

    expect(result.writes.map((w) => w.accepted)).toEqual([1, 6]);
    expect(result.brief?.options).toHaveLength(6);
    expect(result.brief?.onlyFound).toBeNull();
    const retry = requests.at(-1)!.messages.at(-1)!.content as string;
    expect(retry).toContain('uses "eligib"');
    expect(retry).toContain("keep them as they are: R2");
  });

  it("keeps passed options from both writer answers, one per source, with a plain summary", async () => {
    const first = JSON.stringify({
      options: [option("R1", 1), option("R2", 2), option("R3", 3), option("R4", 4, { title: "The guaranteed facility" }), option("R5", 5, { title: "Eligible lab" })],
      summary: "Five facilities.",
    });
    const second = JSON.stringify({
      options: [option("R4", 4), option("R1", 1, { title: "Qualified test site" })],
      summary: "Two facilities offer sea trials for underwater sensors.",
    });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: [] })] })], [first, second]);
    const result = await runScout(input, deps({ chat, hits: [[1, 2, 3, 4, 5, 6].map((n) => hit(n))] }));
    expect(result.writes.map((w) => w.accepted)).toEqual([3, 1]);
    expect(result.brief?.options.map((o) => o.citation.url.slice(-1))).toEqual(["1", "2", "3", "4"]);
    expect(result.brief?.summary).toBe("4 options: 4 test facilities, from Curated testbed list.");
    expect(result.brief?.onlyFound).toBe(4);
  });

  it("stores fewer options only with an 'only N found' note", async () => {
    const few = JSON.stringify({ options: [option("R1", 1), option("R2", 2)], summary: "Two facilities offer sea trials for underwater sensors." });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: ["R1", "R2"] })] })], [few]);
    const result = await runScout(input, deps({ chat, hits: [[hit(1), hit(2)]] }));
    expect(result.brief?.options).toHaveLength(2);
    expect(result.brief?.onlyFound).toBe(2);
    expect(result.brief?.notes).toContain("Only 2 options found that fit the question and passed the checks.");
  });

  it("drops an option that cites an id no tool returned", async () => {
    const reply1 = JSON.stringify({
      options: [option("R1", 1), option("R2", 2), option("R3", 3), option("R4", 4), option("R5", 5), option("R7", 7)],
      summary: "Five test facilities offer sea trials for underwater sensors.",
    });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: [] })] })], [reply1]);
    const result = await runScout(input, deps({ chat, hits: [[1, 2, 3, 4, 5].map((n) => hit(n))] }));
    expect(result.brief?.options.map((o) => o.citation.url)).toEqual([1, 2, 3, 4, 5].map((n) => `https://example.se/facility-${n}`));
    expect(result.brief?.stats.dropped).toBe(1);
  });

  it("stops researching when the time budget is used up", async () => {
    const brief = JSON.stringify({ options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)), summary: "Five test facilities offer sea trials for underwater sensors." });
    const { chat } = fakeChat([], [brief]);
    let clock = START;
    const result = await runScout(input, deps({ chat, hits: [[1, 2, 3, 4, 5].map((n) => hit(n))], now: () => (clock += 200_000), limits: { writeBudgetMs: 10_000_000, retryBudgetMs: 10_000_000 } }));
    expect(result.loopEnd).toBe("time");
    expect(result.brief?.options).toHaveLength(5);
  });

  it("goes on with the store when no live source answers, says which did not, and says it was built from stored sources", async () => {
    const brief = JSON.stringify({ options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)), summary: "Five test facilities offer sea trials for underwater sensors." });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "search", { query: "sea trial sensors" })] }), reply({ tool_calls: [toolCall("c2", "finish", { candidates: [] })] })], [brief]);
    let liveCalls = 0;
    const result = await runScout(
      input,
      deps({
        chat,
        hits: [[1, 2, 3].map((n) => hit(n)), [4, 5].map((n) => hit(n))],
        searchLive: async () => {
          liveCalls++;
          return { hits: [], sources: [failed("EU Funding & Tenders portal", "no answer in 8 s"), failed("Vinnova funding search", "www.vinnova.se answered 503")], inStore: 0, flagged: 0 };
        },
      }),
    );
    expect(liveCalls).toBe(2);
    expect(result.webSearch).toBe("unavailable");
    expect(result.liveAnswered).toEqual([]);
    expect(result.webProblem).toContain("no answer in 8 s");
    expect(result.brief?.notes).toContain(NO_WEB_NOTE);
    expect(result.brief?.notes).toContain("EU Funding & Tenders portal and Vinnova funding search did not answer during this run.");
    expect(result.progress.some((p) => p.kind === "web" && p.text.includes("EU Funding & Tenders portal did not answer (no answer in 8 s)"))).toBe(true);
  });

  it("cites a live result with its origin and retrieval time, and says which live sources answered and when", async () => {
    const brief = JSON.stringify({
      options: [option("R1", 1), option("R2", 2), option("R3", 3), option("R4", 4), liveOption("R6")],
      summary: "Four test facilities and one EU call for sea surveillance sensors.",
    });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: ["R6", "R1"] })] })], [brief]);
    const result = await runScout(
      input,
      deps({ chat, hits: [[1, 2, 3, 4, 5].map((n) => hit(n))], searchLive: async () => liveAnswer([euHit()]) }),
    );
    const live = result.brief!.options.find((o) => o.citation.origin === "live")!;
    expect(live.citation).toMatchObject({
      url: EU_URL,
      origin: "live",
      sourceName: "EU Funding & Tenders",
      liveSource: "EU Funding & Tenders portal",
      liveRetrievedAt: "2026-11-14T09:00:05.000Z",
      retrievedAt: "2026-11-14",
      injection: null,
    });
    expect(live.opportunityId).toBeNull();
    expect(live.deadline).toBe("2027-03-31T21:59:00.000Z");
    // A store citation says nothing about live search.
    expect(result.brief!.options[0].citation).toMatchObject({ origin: "store", liveSource: null, liveRetrievedAt: null });
    expect(result.webSearch).toBe("used");
    expect(result.liveAnswered).toEqual([{ name: "EU Funding & Tenders portal", at: "2026-11-14T09:00:05.000Z" }]);
    expect(result.brief!.notes).toContain("Searched live during this run: EU Funding & Tenders portal (answered 14 November 2026, 10:00).");
    expect(result.brief!.notes).not.toContain(NO_WEB_NOTE);
    expect(result.progress.some((p) => p.text.startsWith(`Live search for "${input.question}": EU Funding & Tenders portal 1 result`))).toBe(true);
  });

  it("puts live results through the same checks: a fact not in the live source is left out", async () => {
    const brief = JSON.stringify({
      options: [
        option("R1", 1),
        option("R2", 2),
        option("R3", 3),
        option("R4", 4),
        option("R5", 5),
        // The live call text says 31 March 2027; 15 April 2027 is in no source.
        liveOption("R6", { whySource: "The EU funds maritime surveillance sensor networks; the call closes on 15 April 2027." }),
      ],
      summary: "Five test facilities offer sea trials for underwater sensors.",
    });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: [] })] })], [brief]);
    const result = await runScout(input, deps({ chat, hits: [[1, 2, 3, 4, 5].map((n) => hit(n))], searchLive: async () => liveAnswer([euHit()]) }));
    expect(result.brief!.options.map((o) => o.citation.origin)).toEqual(["store", "store", "store", "store", "store"]);
    expect(result.writes[0].problems.join(" ")).toContain('"15 April 2027" is not in R6');
  });

  it("carries the injection label of a flagged live result to its citation and says so in the progress", async () => {
    const brief = JSON.stringify({ options: [option("R1", 1), option("R2", 2), option("R3", 3), option("R4", 4), liveOption("R6")], summary: "Four test facilities and one EU call." });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: [] })] })], [brief]);
    const flagged = euHit({ injection: INJECTION_LABEL });
    const result = await runScout(input, deps({ chat, hits: [[1, 2, 3, 4, 5].map((n) => hit(n))], searchLive: async () => ({ ...liveAnswer([flagged]), flagged: 1 }) }));
    expect(result.brief!.options.find((o) => o.citation.origin === "live")!.citation.injection).toBe(INJECTION_LABEL);
    expect(result.progress.some((p) => p.text === "1 result contains text that looks like instructions to an AI; it was treated as data.")).toBe(true);
  });

  it("does not ask the live funders for test facilities", async () => {
    const brief = JSON.stringify({ options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)), summary: "Five test facilities offer sea trials for underwater sensors." });
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "search", { query: "hydroacoustic test range", kind: "testbed" })] }), reply({ tool_calls: [toolCall("c2", "finish", { candidates: [] })] })], [brief]);
    const kinds: (string | undefined)[] = [];
    const result = await runScout(
      input,
      deps({
        chat,
        hits: [[1, 2, 3].map((n) => hit(n)), [4, 5].map((n) => hit(n))],
        searchLive: async (_query, kind) => {
          kinds.push(kind);
          return kind === "testbed" ? { hits: [], sources: [], inStore: 0, flagged: 0, skipped: "the funders' searches only list funding calls" } : liveAnswer([]);
        },
      }),
    );
    expect(kinds).toEqual([undefined, "testbed"]);
    expect(result.progress.some((p) => p.text === `Live search not used for "hydroacoustic test range": the funders' searches only list funding calls.`)).toBe(true);
  });

  it("says once that no web search key is configured, and keeps the web provider within its cap", async () => {
    const brief = JSON.stringify({ options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)), summary: "Five test facilities offer sea trials for underwater sensors." });
    const research = () => [
      reply({ tool_calls: [toolCall("c1", "search", { query: "sea trial sensors" })] }),
      reply({ tool_calls: [toolCall("c2", "search", { query: "hydroacoustics" })] }),
      reply({ tool_calls: [toolCall("c3", "finish", { candidates: [] })] }),
    ];
    const batches = () => [[1, 2, 3].map((n) => hit(n)), [4].map((n) => hit(n)), [5].map((n) => hit(n))];

    let noKeyCalls = 0;
    const noKey = await runScout(
      input,
      deps({
        chat: fakeChat(research(), [brief]).chat,
        hits: batches(),
        searchWeb: async () => {
          noKeyCalls++;
          return { status: "no-key" };
        },
      }),
    );
    expect(noKeyCalls).toBe(1);
    expect(noKey.progress.filter((p) => p.text.includes("no web search key configured"))).toHaveLength(1);
    expect(noKey.brief).not.toBeNull();
    expect(noKey.webProblem).toBe("no web search key configured");

    const queries: string[] = [];
    const capped = await runScout(
      input,
      deps({
        chat: fakeChat(research(), [brief]).chat,
        hits: batches(),
        limits: { maxWebSearches: 2 },
        searchWeb: async (query) => {
          queries.push(query);
          return { status: "answered", provider: "Tavily web search", hits: [], at: "2026-11-14T09:00:02.000Z", inStore: 0, flagged: 0 };
        },
      }),
    );
    expect(queries).toEqual([input.question, "sea trial sensors"]);
    expect(capped.progress.filter((p) => p.text.includes("web searches of this brief are used"))).toHaveLength(1);
    expect(capped.brief!.notes[0]).toBe("Searched live during this run: Tavily web search (answered 14 November 2026, 10:00).");
  });

  it("respects the search cap and rejects reading an unknown id", async () => {
    const brief = JSON.stringify({ options: [1, 2, 3, 4, 5].map((n) => option(`R${n}`, n)), summary: "Five test facilities offer sea trials for underwater sensors." });
    const { chat, requests } = fakeChat(
      [
        reply({ tool_calls: [toolCall("c1", "search", { query: "second" })] }),
        reply({ tool_calls: [toolCall("c2", "read_page", { id: "R99" })] }),
        reply({ tool_calls: [toolCall("c3", "finish", { candidates: ["R1"] })] }),
      ],
      [brief],
    );
    const d = deps({ chat, hits: [[1, 2, 3, 4, 5].map((n) => hit(n))], limits: { maxSearches: 1 } });
    const result = await runScout(input, d);
    expect(d.queries).toHaveLength(1);
    const tools = requests.flatMap((r) => r.messages.filter((m) => m.role === "tool").map((m) => m.content));
    expect(tools.some((t) => t.startsWith("No searches left"))).toBe(true);
    expect(tools.some((t) => t.startsWith('There is no result "R99"'))).toBe(true);
    expect(result.brief).not.toBeNull();
  });

  it("passes a rate limit to the runner and fails cleanly when nothing is found", async () => {
    const limited = async () => {
      throw new NvidiaApiError(429, "Too Many Requests");
    };
    await expect(runScout(input, deps({ chat: limited }))).rejects.toThrow("429");

    let failed: string | null = null;
    const { chat } = fakeChat([reply({ tool_calls: [toolCall("c1", "finish", { candidates: [] })] })], []);
    const result = await runScout(input, { ...deps({ chat, hits: [[]] }), saveFailed: async (error) => void (failed = error) });
    expect(result.brief).toBeNull();
    expect(failed).toContain("No funding calls");
  });
});
