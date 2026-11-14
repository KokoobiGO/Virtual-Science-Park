import { describe, expect, it } from "vitest";
import { evidenceFor, fieldLabel, layoutGraph, nodeOrder, unconnected, type EcoConnection } from "./ecosystem";

function link(id: string, a: string, b: string, score: number): EcoConnection {
  return {
    id,
    aId: a,
    bId: b,
    aName: a.toUpperCase(),
    bName: b.toUpperCase(),
    score,
    sharedOn: ["label"],
    basis: `Basis ${id}`,
    evidence: [
      { companyId: a, claimId: `${id}-a`, field: "offerings", value: `What ${a} offers` },
      { companyId: b, claimId: `${id}-b`, field: "applicationAreas", value: `Where ${b} works` },
    ],
    computedAt: "2026-11-14T17:55:44.036Z",
  };
}

// The six pairs stored today, by shape: two groups of four.
const LINKS = [
  link("1", "techinova", "nkt", 0.777),
  link("2", "kustbevakningen", "embeddedart", 0.7595),
  link("3", "saab", "embeddedart", 0.7594),
  link("4", "nkt", "baltic", 0.757),
  link("5", "saab", "forsvarsmakten", 0.745),
  link("6", "techinova", "addsecure", 0.735),
];

describe("nodeOrder", () => {
  it("walks each group of linked members, so linked members sit together", () => {
    expect(nodeOrder(LINKS)).toEqual(["nkt", "techinova", "addsecure", "baltic", "embeddedart", "kustbevakningen", "saab", "forsvarsmakten"]);
  });

  it("is empty without connections", () => {
    expect(nodeOrder([])).toEqual([]);
  });
});

describe("layoutGraph", () => {
  const size = { width: 400, height: 400, radius: 100, labelGap: 10 };

  it("puts every linked member on the circle once and draws every line between two nodes", () => {
    const { nodes, edges } = layoutGraph(LINKS, size);
    expect(nodes).toHaveLength(8);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(8);
    for (const n of nodes) expect(Math.hypot(n.x - 200, n.y - 200)).toBeCloseTo(100, 0);
    expect(edges).toHaveLength(6);
    const at = new Map(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      expect([e.x1, e.y1]).toEqual([at.get(e.aId)!.x, at.get(e.aId)!.y]);
      expect([e.x2, e.y2]).toEqual([at.get(e.bId)!.x, at.get(e.bId)!.y]);
    }
  });

  it("starts at the top and puts labels outside, on the node's side", () => {
    const { nodes } = layoutGraph(LINKS, size);
    expect(nodes[0]).toMatchObject({ x: 200, y: 100, anchor: "middle" });
    expect(nodes[0].labelY).toBeLessThan(100);
    expect(nodes[2]).toMatchObject({ x: 300, y: 200, anchor: "start" });
    expect(nodes[2].labelX).toBe(310);
    expect(nodes[6]).toMatchObject({ x: 100, y: 200, anchor: "end" });
    expect(nodes.find((n) => n.id === "embeddedart")!.degree).toBe(2);
    expect(nodes.find((n) => n.id === "baltic")!.degree).toBe(1);
  });
});

describe("unconnected", () => {
  it("lists the members without any connection, by name", () => {
    const companies = [
      { id: "zeta", name: "Zeta" },
      { id: "saab", name: "SAAB" },
      { id: "alpha", name: "Alpha" },
    ];
    expect(unconnected(companies, LINKS)).toEqual([
      { id: "alpha", name: "Alpha" },
      { id: "zeta", name: "Zeta" },
    ]);
  });
});

describe("evidenceFor and fieldLabel", () => {
  it("splits the claims by company and names the fields", () => {
    expect(evidenceFor(LINKS[0], "nkt").map((e) => e.value)).toEqual(["Where nkt works"]);
    expect(evidenceFor(LINKS[0], "someone-else")).toEqual([]);
    expect(fieldLabel("applicationAreas")).toBe("Application areas");
    expect(fieldLabel("summary")).toBe("Summary");
    expect(fieldLabel("statedPriorities")).toBe("Stated priorities");
  });
});
