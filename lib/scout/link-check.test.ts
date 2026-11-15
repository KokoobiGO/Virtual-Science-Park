import { describe, expect, it } from "vitest";
import type { checkLinks, LinkResult } from "../links/check";
import { checkCitedLinks } from "./link-check";

/** A fake checker: answers each URL after its delay, through onResult as the real one does. */
function fakeCheck(answers: Record<string, { result: Omit<LinkResult, "url">; ms: number }>): typeof checkLinks {
  return async (urls, options = {}) => {
    const results = await Promise.all(
      urls.map(
        (url) =>
          new Promise<LinkResult>((resolve) =>
            setTimeout(() => {
              const result = { url, ...answers[url].result };
              options.onResult?.(result);
              resolve(result);
            }, answers[url].ms),
          ),
      ),
    );
    return results;
  };
}

describe("checkCitedLinks", () => {
  it("gives each distinct link the checker's verdict and reason", async () => {
    const check = fakeCheck({
      "https://a.example/ok": { result: { outcome: "ok", status: 200, reason: "200 OK" }, ms: 1 },
      "https://b.example/gone": { result: { outcome: "broken", status: 404, reason: "404 Not Found" }, ms: 1 },
    });
    const out = await checkCitedLinks(["https://a.example/ok", "https://b.example/gone", "https://a.example/ok"], { check });
    expect(out).toEqual([
      { url: "https://a.example/ok", outcome: "ok", reason: "200 OK" },
      { url: "https://b.example/gone", outcome: "broken", reason: "404 Not Found" },
    ]);
  });

  it("marks a link unchecked when no answer comes inside the budget, and still returns in time", async () => {
    const check = fakeCheck({
      "https://fast.example/": { result: { outcome: "ok", status: 200, reason: "200 OK" }, ms: 1 },
      "https://slow.example/": { result: { outcome: "ok", status: 200, reason: "200 OK" }, ms: 5_000 },
    });
    const started = Date.now();
    const out = await checkCitedLinks(["https://fast.example/", "https://slow.example/"], { check, budgetMs: 50 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(out[0].outcome).toBe("ok");
    expect(out[1]).toMatchObject({ outcome: "unchecked", reason: "no answer within 50 ms" });
  });

  it("passes an EU topic link to the checker like any other (the checker asks the portal's API)", async () => {
    const eu = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-26";
    const check = fakeCheck({ [eu]: { result: { outcome: "ok", status: null, reason: "the topic is listed in the portal's search API" }, ms: 1 } });
    expect((await checkCitedLinks([eu], { check }))[0].outcome).toBe("ok");
  });
});
