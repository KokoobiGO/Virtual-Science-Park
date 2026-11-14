import { describe, expect, it } from "vitest";
import regionalJson from "../../../data/regional-funding.json";
import { toInstant } from "../swedish-time";
import { parseRegional, regionalCollector, toOpportunities, type RegionalRecord } from ".";

const good: RegionalRecord = {
  externalId: "example-grant",
  organisation: "Example Region",
  title: "Example grant",
  url: "https://example.com/grant",
  description: "A grant. Small companies can apply.",
  checkedAt: "2026-11-14",
};

describe("regional funding file", () => {
  const records = parseRegional(regionalJson);

  it("passes the schema and holds 6 to 10 records", () => {
    expect(records.length).toBeGreaterThanOrEqual(6);
    expect(records.length).toBeLessThanOrEqual(10);
  });

  it("uses each externalId once", () => {
    expect(new Set(records.map((r) => r.externalId)).size).toBe(records.length);
  });

  it("covers Region Blekinge, Almi and Interreg South Baltic", () => {
    expect([...new Set(records.map((r) => r.organisation))].sort()).toEqual(["Almi Blekinge", "Interreg South Baltic", "Region Blekinge"]);
  });
});

describe("parseRegional", () => {
  it("throws a clear error on a bad record", () => {
    expect(() => parseRegional([{ ...good, url: "not a url" }])).toThrow(/regional-funding\.json has a bad record/);
    expect(() => parseRegional([{ ...good, deadline: "soon" }])).toThrow(/bad record/);
    expect(() => parseRegional([{ ...good, tags: ["ai"] }])).toThrow(/bad record/);
  });

  it("throws on a repeated externalId", () => {
    expect(() => parseRegional([good, good])).toThrow(/"example-grant" is used twice/);
  });
});

describe("regional deadlines", () => {
  it("are stored as 23:59 Swedish time on the day, in winter and in summer", () => {
    const [winter, summer] = toOpportunities([
      { ...good, deadline: "2027-01-15" },
      { ...good, externalId: "summer-grant", deadline: "2027-06-15" },
    ]);
    expect(toInstant(winter.deadline, true)?.toISOString()).toBe("2027-01-15T22:59:00.000Z");
    expect(toInstant(summer.deadline, true)?.toISOString()).toBe("2027-06-15T21:59:00.000Z");
  });
});

describe("regionalCollector", () => {
  it("returns simulated funding items titled with their organisation and without tags", async () => {
    const records = parseRegional(regionalJson);
    const result = await regionalCollector.collect();
    expect(result.state).toBe("simulated");
    expect(result.message).toMatch(/^Hand-entered by the team, links checked \d{4}-\d{2}-\d{2}\.$/);
    expect(result.items).toHaveLength(records.length);
    for (const [i, item] of result.items.entries()) {
      expect(item.kind).toBe("funding");
      expect(item.title).toBe(`${records[i].organisation}: ${records[i].title}`);
      expect(item.tags).toBeUndefined();
      expect(item.verified).toBeUndefined();
    }
  });
});
