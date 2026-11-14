import { describe, expect, it, vi } from "vitest";
import { checkLinks, type FetchLike } from "./check";

/** A fake fetch that answers from a table: a status, a redirect target, or a thrown error per URL. */
type Answer = number | { redirect: string; status?: number } | Error | (() => Promise<Response>);

function fakeFetch(table: Record<string, Answer | Answer[]>) {
  const tries = new Map<string, number>();
  return vi.fn<FetchLike>(async (url) => {
    const entry = table[url];
    if (entry === undefined) throw new Error(`unexpected request to ${url}`);
    const n = tries.get(url) ?? 0;
    tries.set(url, n + 1);
    const answer = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
    if (answer instanceof Error) throw answer;
    if (typeof answer === "function") return answer();
    if (typeof answer === "number") return new Response("<html></html>", { status: answer });
    return new Response(null, { status: answer.status ?? 301, headers: { location: answer.redirect } });
  });
}

function fetchFailed(code: string, message: string): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: { code, message } });
}

const fast = { retryDelayMs: 0 };

describe("checkLinks", () => {
  it("asks with a GET, not a HEAD, and only reads the status", async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel: () => void (cancelled = true) });
    const fetchImpl = fakeFetch({ "https://a.example/page": async () => new Response(body, { status: 200 }) });

    const [result] = await checkLinks(["https://a.example/page"], { fetchImpl, ...fast });

    expect(result).toEqual({ url: "https://a.example/page", outcome: "ok", status: 200, reason: "answered 200" });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/^Mozilla\/5\.0/);
    expect((init.headers as Record<string, string>).Accept).toMatch(/^text\/html/);
    expect(cancelled).toBe(true);
  });

  it("follows redirects and records where the link ends up", async () => {
    const fetchImpl = fakeFetch({
      "https://a.example/old": { redirect: "/middle" },
      "https://a.example/middle": { redirect: "https://b.example/new", status: 302 },
      "https://b.example/new": 200,
    });
    const [result] = await checkLinks(["https://a.example/old"], { fetchImpl, ...fast });
    expect(result).toMatchObject({ outcome: "ok", status: 200, redirectedTo: "https://b.example/new" });
  });

  it("asks once more when a redirect ends in a 404, and believes the second answer", async () => {
    const fetchImpl = fakeFetch({
      "https://a.example/topic": [{ redirect: "/data/topic.html" }, 200],
      "https://a.example/data/topic.html": 404,
      "https://a.example/moved": { redirect: "/data/gone.html" },
      "https://a.example/data/gone.html": 404,
    });
    const [flaky, gone] = await checkLinks(["https://a.example/topic", "https://a.example/moved"], { fetchImpl, ...fast });
    expect(flaky).toMatchObject({ outcome: "ok", status: 200 });
    expect(gone).toMatchObject({ outcome: "broken", status: 404 });
  });

  it("calls a link broken when it is sent to the site's own not-found page, even with a 200", async () => {
    const fetchImpl = fakeFetch({
      "https://a.example/gone": { redirect: "/404" },
      "https://a.example/404": 200,
      "https://a.example/calls/404-ways-to-apply": 200,
    });
    const [gone, fine] = await checkLinks(["https://a.example/gone", "https://a.example/calls/404-ways-to-apply"], { fetchImpl, ...fast });
    expect(gone).toMatchObject({ outcome: "broken", status: 200, redirectedTo: "https://a.example/404" });
    expect(gone.reason).toContain("not-found page");
    expect(fine.outcome).toBe("ok");
  });

  it("does not record a redirect that only changes the scheme, the query or a trailing slash", async () => {
    const fetchImpl = fakeFetch({
      "http://a.example/page": { redirect: "https://a.example/page/?lang=sv" },
      "https://a.example/page/?lang=sv": 200,
    });
    const [result] = await checkLinks(["http://a.example/page"], { fetchImpl, ...fast });
    expect(result.outcome).toBe("ok");
    expect(result.redirectedTo).toBeUndefined();
  });

  it("stops after five redirects", async () => {
    const table: Record<string, Answer> = {};
    for (let i = 0; i < 7; i++) table[`https://a.example/${i}`] = { redirect: `/${i + 1}` };
    const fetchImpl = fakeFetch(table);
    const [result] = await checkLinks(["https://a.example/0"], { fetchImpl, ...fast });
    expect(result).toMatchObject({ outcome: "blocked", status: null, redirectedTo: "https://a.example/6" });
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(result.reason).toMatch(/too many redirects/);
  });

  it("refuses a private host as broken without requesting it", async () => {
    const fetchImpl = fakeFetch({});
    const results = await checkLinks(["http://127.0.0.1/admin", "http://intranet.local/", "ftp://a.example/file", "not a url"], {
      fetchImpl,
      ...fast,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(results.map((r) => r.outcome)).toEqual(["broken", "broken", "broken", "broken"]);
    expect(results[0].reason).toBe("not requested: a local or private address (127.0.0.1)");
    expect(results[1].reason).toBe("not requested: a local or private address (intranet.local)");
    expect(results[2].reason).toBe("not requested: not an http(s) address (ftp:)");
    expect(results[3].reason).toBe("not requested: not a valid URL");
    expect(results[0].status).toBeNull();
  });

  it("refuses a redirect to a private host", async () => {
    const fetchImpl = fakeFetch({ "https://a.example/go": { redirect: "http://192.168.1.1/" } });
    const [result] = await checkLinks(["https://a.example/go"], { fetchImpl, ...fast });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: "broken", reason: "not requested: redirects to a local or private address (192.168.1.1)" });
  });

  it("retries a 5xx once: ok if it recovers, broken if it does not", async () => {
    const fetchImpl = fakeFetch({ "https://a.example/flaky": [503, 200], "https://b.example/down": 502 });
    const [flaky, down] = await checkLinks(["https://a.example/flaky", "https://b.example/down"], { fetchImpl, ...fast });
    expect(flaky).toMatchObject({ outcome: "ok", status: 200 });
    expect(down).toMatchObject({ outcome: "broken", status: 502, reason: "server error 502, also on a second try" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("retries a network error once, but not a 4xx or a TLS error", async () => {
    const fetchImpl = fakeFetch({
      "https://a.example/reset": [fetchFailed("ECONNRESET", "read ECONNRESET"), 200],
      "https://b.example/gone": 404,
      "https://c.example/forbidden": 403,
      "https://d.example/expired": fetchFailed("CERT_HAS_EXPIRED", "certificate has expired"),
      "https://nowhere.example/": fetchFailed("ENOTFOUND", "getaddrinfo ENOTFOUND nowhere.example"),
    });
    const urls = [
      "https://a.example/reset",
      "https://b.example/gone",
      "https://c.example/forbidden",
      "https://d.example/expired",
      "https://nowhere.example/",
    ];
    const results = await checkLinks(urls, { fetchImpl, ...fast });

    expect(results.map((r) => [r.outcome, r.status])).toEqual([
      ["ok", 200],
      ["broken", 404],
      ["blocked", 403],
      ["broken", null],
      ["broken", null],
    ]);
    const calls = (url: string) => fetchImpl.mock.calls.filter(([u]) => u === url).length;
    expect(calls("https://a.example/reset")).toBe(2);
    expect(calls("https://b.example/gone")).toBe(1);
    expect(calls("https://c.example/forbidden")).toBe(1);
    expect(calls("https://d.example/expired")).toBe(1);
    expect(calls("https://nowhere.example/")).toBe(2);
    expect(results[3].reason).toBe("TLS error: certificate has expired");
    expect(results[4].reason).toMatch(/does not exist \(DNS\)/);
  });

  it("calls a site that does not answer in time blocked, after one retry", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
    const fetchImpl = vi.fn(hang);
    const [result] = await checkLinks(["https://slow.example/"], { fetchImpl, timeoutMs: 20, ...fast });
    expect(result).toMatchObject({ outcome: "blocked", status: null, reason: "no answer in 0.02 s" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("checks each URL once, even when it is listed many times", async () => {
    const fetchImpl = fakeFetch({ "https://a.example/x": 200, "https://a.example/y": 404 });
    const results = await checkLinks(["https://a.example/x", "https://a.example/y", "https://a.example/x"], { fetchImpl, ...fast });
    expect(results.map((r) => r.url)).toEqual(["https://a.example/x", "https://a.example/y"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("asks at most 6 at once and at most 2 at once per host", async () => {
    const active = new Map<string, number>();
    let activeTotal = 0;
    let maxTotal = 0;
    const maxPerHost = new Map<string, number>();
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      const host = new URL(url).host;
      active.set(host, (active.get(host) ?? 0) + 1);
      activeTotal++;
      maxTotal = Math.max(maxTotal, activeTotal);
      maxPerHost.set(host, Math.max(maxPerHost.get(host) ?? 0, active.get(host)!));
      await new Promise((resolve) => setTimeout(resolve, 5));
      active.set(host, active.get(host)! - 1);
      activeTotal--;
      return new Response(null, { status: 200 });
    });

    const urls = ["a", "b", "c", "d"].flatMap((host) => [1, 2, 3, 4, 5].map((n) => `https://${host}.example/${n}`));
    const results = await checkLinks(urls, { fetchImpl, ...fast });

    expect(results).toHaveLength(20);
    expect(results.every((r) => r.outcome === "ok")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(20);
    expect(maxTotal).toBe(6);
    expect([...maxPerHost.values()]).toEqual([2, 2, 2, 2]);
  });
});
