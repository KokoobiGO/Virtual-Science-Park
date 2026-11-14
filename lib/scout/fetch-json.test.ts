import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchApiJson } from "./fetch-json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchApiJson", () => {
  it("refuses local and private addresses before any request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchApiJson({ url: "http://127.0.0.1:8288/x" })).rejects.toThrow("Local and private addresses cannot be fetched");
    await expect(fetchApiJson({ url: "file:///etc/passwd" })).rejects.toThrow("Only http and https");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the user agent, asks for JSON, follows no redirect and parses the answer", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ results: [1] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchApiJson({ url: "https://api.example.org/search", method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).toEqual({ results: [1] });
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init).toMatchObject({ method: "POST", body: "{}", redirect: "manual" });
    expect(init.headers).toMatchObject({ Accept: "application/json", "Content-Type": "application/json" });
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("snapshot-fetcher");
  });

  it("fails on an error status, a redirect and an answer that is not JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 401 }));
    await expect(fetchApiJson({ url: "https://api.example.org/x" })).rejects.toThrow("api.example.org answered 401");
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } }));
    await expect(fetchApiJson({ url: "https://api.example.org/x" })).rejects.toThrow("answered 302");
    vi.stubGlobal("fetch", async () => new Response("<html>bot check</html>", { status: 200 }));
    await expect(fetchApiJson({ url: "https://api.example.org/x" })).rejects.toThrow("did not answer JSON");
  });

  it("says when the answer did not come in time", async () => {
    vi.stubGlobal("fetch", (_url: URL, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(fetchApiJson({ url: "https://api.example.org/x" }, 20)).rejects.toThrow("no answer in 0.02 s");
  });
});
