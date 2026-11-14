import { describe, expect, it } from "vitest";
import { parseTavily, TAVILY_URL, tavilyRequest } from "./web-tavily";

// The response shape of https://docs.tavily.com/documentation/api-reference/endpoint/search (read 2026-11-14), with our kind of hits.
const DOCS_RESPONSE = {
  query: "grid flexibility funding",
  answer: null,
  images: [],
  results: [
    {
      title: "Industriell flexibel energistyrning med avancerad digitalisering | Vinnova",
      url: "https://www.vinnova.se/e/industriell-flexibel-energistyrning/2026-02019/",
      content: "Projekt som utvecklar flexibel energistyrning i industrin. [...] Ansök senast 19 januari 2027.",
      score: 0.81,
      raw_content: null,
      published_date: null,
      favicon: "https://www.vinnova.se/favicon.ico",
      id: "a1b2c3-01",
    },
    { title: "No address", content: "A result without a url is skipped.", score: 0.2 },
    { title: null, url: "https://energimyndigheten.se/utlysningar/x/", content: null, score: 0.1 },
  ],
  response_time: 1.67,
  usage: { credits: 1 },
  request_id: "123e4567-e89b-12d3-a456-426614174000",
};

describe("Tavily", () => {
  it("posts the query with the key as a bearer token and the allow-list as include_domains", () => {
    const request = tavilyRequest("grid flexibility funding", { apiKey: "tvly-test", domains: ["vinnova.se", "europa.eu"], maxResults: 10 });
    expect(request).toMatchObject({ url: TAVILY_URL, method: "POST", headers: { Authorization: "Bearer tvly-test", "Content-Type": "application/json" } });
    expect(JSON.parse(request.body as string)).toEqual({
      query: "grid flexibility funding",
      search_depth: "basic",
      max_results: 10,
      topic: "general",
      include_domains: ["vinnova.se", "europa.eu"],
      include_answer: false,
      include_raw_content: false,
    });
    expect(JSON.parse(tavilyRequest("x", { apiKey: "k", domains: [], maxResults: 50 }).body as string).max_results).toBe(20);
  });

  it("parses the documented response into hits", () => {
    expect(parseTavily(DOCS_RESPONSE)).toEqual([
      {
        title: "Industriell flexibel energistyrning med avancerad digitalisering | Vinnova",
        url: "https://www.vinnova.se/e/industriell-flexibel-energistyrning/2026-02019/",
        snippet: "Projekt som utvecklar flexibel energistyrning i industrin. [...] Ansök senast 19 januari 2027.",
      },
      { title: "https://energimyndigheten.se/utlysningar/x/", url: "https://energimyndigheten.se/utlysningar/x/", snippet: "" },
    ]);
  });

  it("refuses an answer without a results list", () => {
    expect(() => parseTavily({ detail: { error: "Unauthorized: missing or invalid API key." } })).toThrow("without a results list");
    expect(() => parseTavily(null)).toThrow("without a results list");
  });
});
