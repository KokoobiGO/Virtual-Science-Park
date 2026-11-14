import { describe, expect, it } from "vitest";
import { ALLOWED_WEB_DOMAINS } from "./search";
import { BRAVE_MAX_QUERY_CHARS, BRAVE_URL, braveQuery, braveRequest, parseBrave } from "./web-brave";

// The response shape of https://api-dashboard.search.brave.com/api-reference/web/search/get (WebSearchApiResponse, read 2026-11-14).
const DOCS_RESPONSE = {
  type: "search",
  query: { original: "maritime surveillance funding", more_results_available: false },
  web: {
    type: "search",
    family_friendly: true,
    results: [
      {
        type: "search_result",
        title: "Språng Challenge: The <strong>Baltic</strong> Marine Watchdog | Vinnova",
        url: "https://www.vinnova.se/e/sprang-challenge/the-baltic-marine-watchdog/",
        description: "Funding for autonomous systems for sea surveillance &amp; monitoring.",
        page_age: "2026-09-01T10:00:00",
        age: "2 months ago",
        language: "en",
        family_friendly: true,
        meta_url: { scheme: "https", netloc: "www.vinnova.se", hostname: "www.vinnova.se", favicon: "https://imgs.search.brave.com/x", path: "› e › sprang-challenge" },
      },
      { type: "search_result", title: "No url" },
    ],
  },
};

describe("Brave Search", () => {
  it("sends the key in X-Subscription-Token and the allow-list as site: operators", () => {
    const request = braveRequest("maritime surveillance funding", { apiKey: "brave-test", domains: ["vinnova.se", "europa.eu"], count: 10 });
    expect(request.method).toBe("GET");
    expect(request.headers).toEqual({ "X-Subscription-Token": "brave-test", Accept: "application/json" });
    const url = new URL(request.url);
    expect(`${url.origin}${url.pathname}`).toBe(BRAVE_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "maritime surveillance funding site:vinnova.se OR site:europa.eu",
      count: "10",
      result_filter: "web",
      text_decorations: "false",
      safesearch: "moderate",
    });
  });

  it("keeps the query within Brave's length limit with the whole allow-list", () => {
    const long = "funding for safer electricity grid technology and sea surveillance sensors ".repeat(4);
    const q = braveQuery(long, ALLOWED_WEB_DOMAINS);
    expect(q.length).toBeLessThanOrEqual(BRAVE_MAX_QUERY_CHARS);
    expect(q).toContain(`site:${ALLOWED_WEB_DOMAINS[0]}`);
    expect(braveQuery("grid", ALLOWED_WEB_DOMAINS).split(" OR ")).toHaveLength(ALLOWED_WEB_DOMAINS.length);
  });

  it("parses the documented response into plain-text hits", () => {
    expect(parseBrave(DOCS_RESPONSE)).toEqual([
      {
        title: "Språng Challenge: The Baltic Marine Watchdog | Vinnova",
        url: "https://www.vinnova.se/e/sprang-challenge/the-baltic-marine-watchdog/",
        snippet: "Funding for autonomous systems for sea surveillance & monitoring.",
      },
    ]);
  });

  it("reads an answer without web results as none, and refuses anything else", () => {
    expect(parseBrave({ type: "search", query: { original: "x" } })).toEqual([]);
    expect(() => parseBrave({ type: "ErrorResponse", error: { code: "SUBSCRIPTION_TOKEN_INVALID", status: 422 } })).toThrow("without a web results list");
  });
});
