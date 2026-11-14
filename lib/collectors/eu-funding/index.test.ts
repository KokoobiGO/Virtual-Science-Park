import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import recordedJson from "./recorded.json";

vi.mock("./api", async (importOriginal) => ({ ...(await importOriginal<typeof import("./api")>()), searchEuFunding: vi.fn() }));

import { searchEuFunding } from "./api";
import { euFundingCollector } from "./index";

const search = vi.mocked(searchEuFunding);
const demoMode = process.env.DEMO_MODE;

describe("euFundingCollector", () => {
  beforeEach(() => {
    delete process.env.DEMO_MODE;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(recordedJson.recordedAt));
  });

  afterEach(() => {
    vi.useRealTimers();
    search.mockReset();
    if (demoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = demoMode;
  });

  it("is keyed eu_funding", () => {
    expect(euFundingCollector.source).toBe("eu_funding");
    expect(euFundingCollector.label).toBe("EU Funding & Tenders");
  });

  it("uses the recorded copy, labelled cached, when the live search fails", async () => {
    search.mockRejectedValue(new Error("api.tech.ec.europa.eu answered 503"));
    const result = await euFundingCollector.collect();
    expect(result.state).toBe("cached");
    expect(result.cachedAt).toBe(recordedJson.recordedAt);
    expect(result.message).toContain("answered 503");
    expect(result.items.length).toBeGreaterThan(100);
  });

  it("falls back as well when the live search finds no open topics", async () => {
    search.mockResolvedValue([]);
    const result = await euFundingCollector.collect();
    expect(result.state).toBe("cached");
    expect(result.message).toContain("no open topics");
  });

  it("returns live items when the search works", async () => {
    search.mockResolvedValue(recordedJson.data);
    const result = await euFundingCollector.collect();
    expect(result.state).toBe("live");
    expect(result.cachedAt).toBeUndefined();
    expect(result.items.length).toBeGreaterThan(100);
  });
});
