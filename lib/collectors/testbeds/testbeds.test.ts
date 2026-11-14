import { describe, expect, it } from "vitest";
import testbedsJson from "../../../data/testbeds.seed.json";
import { parseTestbeds, testbedsCollector, toOpportunities, type TestbedRecord } from ".";

const good: TestbedRecord = {
  externalId: "example-lab",
  title: "Example lab",
  url: "https://example.com/lab",
  description: "A lab. Companies can book it.",
  tags: ["sensor"],
  verified: true,
  linkOk: true,
  checkedAt: "2026-11-14",
  origin: "curated",
};

describe("testbeds seed file", () => {
  const records = parseTestbeds(testbedsJson);

  it("passes the schema and holds the seven curated testbeds", () => {
    expect(records.filter((r) => r.origin === "curated")).toHaveLength(7);
    expect(records.filter((r) => r.origin === "vinnova_list").length).toBeLessThanOrEqual(20);
  });

  it("uses each externalId once", () => {
    expect(new Set(records.map((r) => r.externalId)).size).toBe(records.length);
  });

  it("explains every unverified record or bad link in a note", () => {
    const unexplained = records.filter((r) => (!r.linkOk || !r.verified) && !r.note).map((r) => r.externalId);
    expect(unexplained).toEqual([]);
  });
});

describe("parseTestbeds", () => {
  it("throws a clear error on a bad record", () => {
    expect(() => parseTestbeds([{ ...good, tags: [] }])).toThrow(/testbeds\.seed\.json has a bad record/);
    expect(() => parseTestbeds([{ ...good, tags: ["space"] }])).toThrow(/bad record/);
    expect(() => parseTestbeds([{ ...good, extra: 1 }])).toThrow(/bad record/);
  });

  it("throws on a repeated externalId", () => {
    expect(() => parseTestbeds([good, good])).toThrow(/"example-lab" is used twice/);
  });
});

describe("testbedsCollector", () => {
  it("returns simulated testbeds, each with verified set and at least one tag", async () => {
    const result = await testbedsCollector.collect();
    expect(result.state).toBe("simulated");
    expect(result.message).toMatch(/^Hand-entered by the team, links checked \d{4}-\d{2}-\d{2}/);
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.kind).toBe("testbed");
      expect(typeof item.verified).toBe("boolean");
      expect(item.tags?.length).toBeGreaterThan(0);
      expect(item.deadline).toBeUndefined();
    }
  });

  it("leaves out records whose link is not ok", async () => {
    const records = parseTestbeds(testbedsJson);
    const dead = records.filter((r) => !r.linkOk).map((r) => r.externalId);
    expect(dead.length).toBeGreaterThan(0);
    const { items } = await testbedsCollector.collect();
    expect(items.map((i) => i.externalId).filter((id) => dead.includes(id))).toEqual([]);
    expect(items).toHaveLength(records.length - dead.length);

    const mapped = toOpportunities([good, { ...good, externalId: "dead-lab", linkOk: false }]);
    expect(mapped.map((i) => i.externalId)).toEqual(["example-lab"]);
  });
});
