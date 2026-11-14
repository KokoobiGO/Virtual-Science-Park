import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupEuTopics, searchEuFunding } from "./api";
import recordedLookup from "./recorded-lookup.json";

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

describe("lookupEuTopics", () => {
  it("finds the topics the recorded lookup returned, by exact identifier, and not the made-up one", async () => {
    const fetch = stubFetch(recordedLookup.response);
    const found = await lookupEuTopics(recordedLookup.identifiers);

    expect([...found].sort()).toEqual([
      "HORIZON-CL5-2027-04-Two-Stage-D2-07",
      "HORIZON-CL6-2027-01-CIRCBIO-01",
      "HORIZON-CL6-2027-01-CIRCBIO-01-two-stage",
    ]);
    expect(found.has("HORIZON-CL6-2027-01-CIRCBIO-99-two-stage")).toBe(false);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(new URL(url).searchParams.get("text")).toBe("***");
    expect(init.method).toBe("POST");
    const query = JSON.parse(await ((init.body as FormData).get("query") as Blob).text());
    expect(query).toEqual({ bool: { must: [{ terms: { identifier: recordedLookup.identifiers } }] } });
  });

  it("does not count a hit whose identifier differs only in case or suffix", async () => {
    stubFetch({ totalResults: 1, results: [{ metadata: { identifier: ["HORIZON-CL6-2027-01-CIRCBIO-01"] } }] });
    const found = await lookupEuTopics(["HORIZON-CL6-2027-01-CIRCBIO-01-two-stage", "horizon-cl6-2027-01-circbio-01"]);
    expect(found.size).toBe(0);
  });

  it("asks for at most 50 identifiers per request, one request after another", async () => {
    const fetch = stubFetch({ totalResults: 0, results: [] });
    const ids = Array.from({ length: 120 }, (_, i) => `T-${i}`);
    await lookupEuTopics([...ids, ...ids]);
    expect(fetch).toHaveBeenCalledTimes(3);
    const sizes = await Promise.all(
      fetch.mock.calls.map(async ([, init]) => JSON.parse(await ((init.body as FormData).get("query") as Blob).text()).bool.must[0].terms.identifier.length),
    );
    expect(sizes).toEqual([50, 50, 20]);
  });

  it("makes no request for no identifiers", async () => {
    const fetch = stubFetch({ results: [] });
    expect((await lookupEuTopics([])).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws rather than call a topic missing when the answer cannot be trusted", async () => {
    stubFetch({ message: "An internal error occurred" }, 500);
    await expect(lookupEuTopics(["A"])).rejects.toThrow("answered 500");
    stubFetch({ totalResults: 0 });
    await expect(lookupEuTopics(["A"])).rejects.toThrow("without a results list");
    stubFetch({ totalResults: 150, results: [] });
    await expect(lookupEuTopics(["A"])).rejects.toThrow("found 150 hits but returned 0");
  });
});
