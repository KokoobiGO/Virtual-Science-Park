import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchPageError } from "./fetcher/fetch-page";
import { fetchSnapshot } from "./snapshots";

const { answers, limit, fetchPage } = vi.hoisted(() => {
  // Each select ends in limit(): it answers with the next list from `answers`.
  const answers: unknown[][] = [];
  return { answers, limit: vi.fn(async () => answers.shift() ?? []), fetchPage: vi.fn() };
});

vi.mock("./db", () => {
  const query = { from: () => query, where: () => query, orderBy: () => query, limit };
  return { getDb: () => ({ select: () => query }) };
});
vi.mock("./fetcher/fetch-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fetcher/fetch-page")>()),
  fetchPage: (url: string) => fetchPage(url),
}));

const stored = {
  id: "0b1f8f7e-1b0a-4c0e-9a59-6a0e7d2f9d11",
  url: "https://example.se/",
  source: "company_site",
  contentText: "Vi gör sensorer för havet.",
};

beforeEach(() => {
  answers.length = 0;
  limit.mockClear();
  fetchPage.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("fetchSnapshot with DEMO_MODE=cached", () => {
  beforeEach(() => vi.stubEnv("DEMO_MODE", "cached"));

  it("gives the latest stored copy back as unchanged and fetches nothing", async () => {
    answers.push([stored]);
    await expect(fetchSnapshot({ url: "https://example.se", source: "company_site" })).resolves.toEqual({
      snapshot: stored,
      unchanged: true,
      method: "stored",
    });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("falls back to the company's latest copy from the same source when the URL redirected", async () => {
    answers.push([], [stored]);
    const result = await fetchSnapshot({ url: "https://www.example.se/", source: "company_site", companyId: "c1" });
    expect(result.snapshot).toBe(stored);
    expect(limit).toHaveBeenCalledTimes(2);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("fails for good when no copy is stored", async () => {
    answers.push([], []);
    const error = await fetchSnapshot({ url: "https://nowhere.se/", source: "company_site", companyId: "c1" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchPageError);
    expect((error as InstanceType<typeof FetchPageError>).permanent).toBe(true);
    expect((error as Error).message).toBe("DEMO_MODE=cached and no stored copy of https://nowhere.se/");
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("does not look by company when no company is given", async () => {
    answers.push([]);
    await expect(fetchSnapshot({ url: "https://nowhere.se/", source: "manual" })).rejects.toThrow("no stored copy");
    expect(limit).toHaveBeenCalledTimes(1);
  });
});

describe("fetchSnapshot without DEMO_MODE", () => {
  it("fetches the page", async () => {
    vi.stubEnv("DEMO_MODE", "");
    fetchPage.mockRejectedValue(new FetchPageError("https://example.se/ answered 404", 404));
    await expect(fetchSnapshot({ url: "https://example.se/", source: "company_site" })).rejects.toThrow("answered 404");
    expect(fetchPage).toHaveBeenCalledWith("https://example.se/");
    expect(limit).not.toHaveBeenCalled();
  });
});
