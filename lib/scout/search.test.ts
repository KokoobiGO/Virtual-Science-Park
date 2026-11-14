import { describe, expect, it } from "vitest";
import type { FetchedPage } from "../fetcher/fetch-page";
import { isAllowedUrl, isBotChallenge, keywordTerms, maxSearches, parseDuckDuckGo, resultTarget, searchWeb, WebSearchUnavailable } from "./search";

const RESULTS_PAGE = `<html><body><div class="results">
  <div class="result results_links results_links_deep web-result result--ad">
    <a class="result__a" href="//duckduckgo.com/y.js?ad_domain=ads.example">Buy sensors now</a>
  </div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.vinnova.se%2Fe%2Fradikal-innovation%2Fthe-baltic-marine-watchdog-challenge%2F&amp;rut=abc">The Baltic Marine Watchdog Challenge | Vinnova</a></h2>
    <a class="result__snippet" href="#">Funding for autonomous systems for <b>sea surveillance</b>.</a>
  </div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.com%2Fsensors&amp;rut=def">Sensor shop</a></h2>
    <a class="result__snippet" href="#">Not an allowed site.</a>
  </div>
  <div class="result results_links web-result">
    <h2 class="result__title"><a class="result__a" href="https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/X">EU topic X</a></h2>
    <a class="result__snippet" href="#">Ocean observation call.</a>
  </div>
</div></body></html>`;

const CHALLENGE = `<html><body><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div><form id="challenge-form"></form></body></html>`;

const page = (status: number, html: string): FetchedPage => ({ url: "https://html.duckduckgo.com/html/?q=x", status, html });

describe("web search (DuckDuckGo)", () => {
  it("parses organic results, decodes the redirect links and skips ads", () => {
    expect(parseDuckDuckGo(RESULTS_PAGE)).toEqual([
      {
        title: "The Baltic Marine Watchdog Challenge | Vinnova",
        url: "https://www.vinnova.se/e/radikal-innovation/the-baltic-marine-watchdog-challenge/",
        snippet: "Funding for autonomous systems for sea surveillance.",
      },
      { title: "Sensor shop", url: "https://www.example.com/sensors", snippet: "Not an allowed site." },
      { title: "EU topic X", url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/X", snippet: "Ocean observation call." },
    ]);
  });

  it("keeps only hits on allowed sites", async () => {
    const hits = await searchWeb("sea surveillance", { fetch: async () => page(200, RESULTS_PAGE), now: new Date("2026-11-14T10:00:00Z") });
    expect(hits.map((h) => h.url)).toEqual([
      "https://www.vinnova.se/e/radikal-innovation/the-baltic-marine-watchdog-challenge/",
      "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/X",
    ]);
    expect(hits[0]).toMatchObject({ origin: "web", retrievedAt: "2026-11-14T10:00:00.000Z", sourceName: "vinnova.se" });
  });

  it("reports the bot challenge as unavailable instead of trying to get around it", async () => {
    expect(isBotChallenge(page(202, CHALLENGE))).toBe(true);
    expect(isBotChallenge(page(200, RESULTS_PAGE))).toBe(false);
    await expect(searchWeb("x", { fetch: async () => page(202, CHALLENGE) })).rejects.toBeInstanceOf(WebSearchUnavailable);
    await expect(searchWeb("x", { fetch: async () => Promise.reject(new Error("no answer in 15 s")) })).rejects.toThrow("could not be reached");
  });

  it("matches allowed domains and their subdomains only", () => {
    expect(isAllowedUrl("https://www.vinnova.se/x")).toBe(true);
    expect(isAllowedUrl("https://ec.europa.eu/info")).toBe(true);
    expect(isAllowedUrl("https://testandevaluation.fmv.se/about/")).toBe(true);
    expect(isAllowedUrl("https://notvinnova.se/x")).toBe(false);
    expect(isAllowedUrl("https://vinnova.se.evil.com/x")).toBe(false);
    expect(isAllowedUrl("ftp://vinnova.se/x")).toBe(false);
    expect(isAllowedUrl("not a url")).toBe(false);
  });

  it("reads result links in both forms", () => {
    expect(resultTarget("//duckduckgo.com/l/?uddg=https%3A%2F%2Fri.se%2Fen&rut=1")).toBe("https://ri.se/en");
    expect(resultTarget("https://www.bth.se/x")).toBe("https://www.bth.se/x");
    expect(resultTarget("//duckduckgo.com/l/?rut=1")).toBeNull();
  });
});

describe("store search helpers", () => {
  it("keeps the words that say what is searched for", () => {
    expect(keywordTerms("Funding for safer electricity grid technology")).toEqual(["safer", "electricity", "grid"]);
    expect(keywordTerms("Which test facilities could fit an underwater sensor?")).toEqual(["underwater", "sensor"]);
    expect(keywordTerms("'); drop table x; --")).toEqual(["drop", "table"]);
    expect(keywordTerms("elnät och säkerhet")).toEqual(["elnät", "säkerhet"]);
  });

  it("reads SCOUT_MAX_SEARCHES with a default of 6", () => {
    // An explicit argument: vitest loads .env.local, which may set the real variable.
    expect(maxSearches("")).toBe(6);
    expect(maxSearches("8")).toBe(8);
    expect(maxSearches("0")).toBe(6);
    expect(maxSearches("many")).toBe(6);
    expect(maxSearches("50")).toBe(6);
  });
});
