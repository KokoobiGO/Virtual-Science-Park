import { afterEach, describe, expect, it, vi } from "vitest";
import { searchEuFunding } from "./api";

const now = new Date("2026-11-14T12:00:00Z");

function stubFetch(body: unknown, status = 200) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("searchEuFunding", () => {
  it("posts one JSON query per search and returns the hits in order", async () => {
    const fetch = stubFetch({ results: [{ metadata: { identifier: ["A"] } }] });
    const hits = await searchEuFunding(now, [{ text: "marine ocean" }, { text: "***", programmes: ["EIC"], pageSize: 500 }]);

    expect(hits.map((hit) => hit.metadata.identifier?.[0])).toEqual(["A", "A"]);
    const [[firstUrl, init], [secondUrl]] = fetch.mock.calls;
    const url = new URL(firstUrl);
    expect(url.searchParams.get("apiKey")).toBe("SEDIA");
    expect(url.searchParams.get("text")).toBe("marine ocean");
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(new URL(secondUrl).searchParams.get("pageSize")).toBe("100");
    expect(init.method).toBe("POST");

    const form = init.body as FormData;
    const queryPart = form.get("query") as Blob;
    expect(queryPart.type).toBe("application/json");
    const query = await queryPart.text();
    expect(query).toContain('"deadlineDate":{"gte":"2026-11-14T00:00:00.000+0000"}');
    expect(query).toContain('"frameworkProgramme":["43108390","44181033","43152860","43392145"]');
    expect(await (form.get("languages") as Blob).text()).toBe('["en"]');
  });

  it("throws on an error answer or an unexpected shape, so the collector falls back", async () => {
    stubFetch({ message: "An internal error occurred" }, 500);
    await expect(searchEuFunding(now, [{ text: "cyber" }])).rejects.toThrow("answered 500");
    stubFetch({ totalResults: 0 });
    await expect(searchEuFunding(now, [{ text: "cyber" }])).rejects.toThrow("without a results list");
  });
});
