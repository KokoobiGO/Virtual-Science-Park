import { describe, expect, it } from "vitest";
import {
  MAX_SIMILAR,
  memberRole,
  mergeCandidates,
  NEIGHBOURS_PER_COMPANY,
  opportunityCandidates,
  pairCandidates,
  roleCandidates,
  sameKind,
  sharedOpportunitiesByPair,
  type KeptMatch,
  type Member,
  type MemberRole,
  type Neighbour,
} from "./candidates";
import type { SharedOpportunity } from "./prompt";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const n = (from: number, to: number, similarity: number): Neighbour => ({ companyId: id(from), neighbourId: id(to), similarity });

describe("pairCandidates", () => {
  it("keeps each pair once, with the smaller id first", () => {
    const pairs = pairCandidates([n(2, 1, 0.9), n(1, 2, 0.9), n(3, 1, 0.7)]);
    expect(pairs).toEqual([
      { companyAId: id(1), companyBId: id(2), similarity: 0.9 },
      { companyAId: id(1), companyBId: id(3), similarity: 0.7 },
    ]);
    for (const p of pairs) expect(p.companyAId < p.companyBId).toBe(true);
  });

  it("orders uuids the way Postgres does, also with capital letters", () => {
    const [pair] = pairCandidates([{ companyId: "FFFFFFFF-0000-0000-0000-000000000000", neighbourId: "0aaaaaaa-0000-0000-0000-000000000000", similarity: 0.5 }]);
    expect(pair.companyAId).toBe("0aaaaaaa-0000-0000-0000-000000000000");
    expect(pair.companyBId).toBe("ffffffff-0000-0000-0000-000000000000");
  });

  it("leaves out a company paired with itself", () => {
    expect(pairCandidates([n(1, 1, 1)])).toEqual([]);
  });

  it("takes at most three neighbours per company, the nearest", () => {
    const neighbours = [0.5, 0.9, 0.6, 0.8, 0.7, 0.4].map((s, i) => n(1, i + 2, s));
    const pairs = pairCandidates(neighbours);
    expect(NEIGHBOURS_PER_COMPANY).toBe(3);
    expect(pairs.map((p) => p.similarity)).toEqual([0.9, 0.8, 0.7]);
  });

  it("keeps the most similar pairs up to the cap, the most similar first", () => {
    const neighbours = Array.from({ length: 40 }, (_, c) => [1, 2, 3].map((k) => n(c, 100 + c * 3 + k, (c * 3 + k) / 1000))).flat();
    const pairs = pairCandidates(neighbours);
    expect(pairs).toHaveLength(MAX_SIMILAR);
    expect(pairs[0].similarity).toBe(0.12);
    expect([...pairs].sort((x, y) => y.similarity - x.similarity)).toEqual(pairs);
    expect(pairCandidates(neighbours, { max: 5 })).toHaveLength(5);
  });

  it("breaks ties by id, whatever order the rows come in", () => {
    const rows = [n(1, 4, 0.5), n(1, 3, 0.5), n(1, 2, 0.5), n(1, 5, 0.5)];
    const first = pairCandidates(rows, { perCompany: 2 });
    expect(pairCandidates([...rows].reverse(), { perCompany: 2 })).toEqual(first);
    expect(first.map((p) => p.companyBId)).toEqual([id(2), id(3)]);
  });
});

describe("memberRole and sameKind", () => {
  it("reads the role from the industry on BSP's member page", () => {
    expect(memberRole("Offentlig verksamhet")).toBe("public");
    expect(memberRole("Återvinning, Energi, Färjerederi, Infrastruktur")).toBe("operator");
    expect(memberRole("Färjerederi")).toBe("operator");
    expect(memberRole("Konstruktion, Konsultverksamhet, Projektledning, Tillverkning")).toBe("consultancy");
    expect(memberRole("Finansiering, Rådgivning")).toBe("consultancy");
    expect(memberRole("Sjökabelinstallation")).toBe("maker");
    expect(memberRole(null)).toBe("maker");
  });

  it("calls two users, or two consultancies, the same kind; a maker never", () => {
    expect(sameKind("public", "public")).toBe(true);
    expect(sameKind("public", "operator")).toBe(true);
    expect(sameKind("consultancy", "consultancy")).toBe(true);
    expect(sameKind("maker", "maker")).toBe(false);
    expect(sameKind("maker", "public")).toBe(false);
    expect(sameKind("consultancy", "public")).toBe(false);
  });
});

const member = (k: number, industry: string, tags: string[]): Member => ({ id: id(k), name: `M${k}`, industry, tags });

describe("roleCandidates", () => {
  const members = [
    member(1, "Offentlig verksamhet", ["marine", "defence"]),
    member(2, "Marinteknik", ["marine"]),
    member(3, "Försvarssektorn", ["defence", "sensor"]),
    member(4, "Industri", ["energy"]),
    member(5, "Konsultverksamhet", ["marine"]),
    member(6, "Offentlig verksamhet", ["marine"]),
  ];
  const similarity = (a: string, b: string) => (a === id(1) && b === id(3) ? 0.8 : 0.5);

  it("pairs a user with a maker that shares a tag, never two users, a consultancy or no shared tag", () => {
    const pairs = roleCandidates(members, similarity);
    expect(pairs.map((p) => [p.companyAId, p.companyBId])).toEqual([
      [id(1), id(3)],
      [id(1), id(2)],
      [id(2), id(6)],
    ]);
  });

  it("caps the pairs per member, the most similar first", () => {
    expect(roleCandidates(members, similarity, { perCompany: 1 }).map((p) => [p.companyAId, p.companyBId])).toEqual([
      [id(1), id(3)],
      [id(2), id(6)],
    ]);
  });
});

const opp = (k: number, kind: string): SharedOpportunity => ({ id: `opp-${k}`, kind, source: "Vinnova", title: `Opportunity ${k}`, deadline: "2027-01-14", eventDate: null });
const kept = (company: number, o: SharedOpportunity): KeptMatch => ({ companyId: id(company), opportunity: o });

describe("shared opportunities", () => {
  it("weighs a test facility over a call over an event, less when many members have it, and leaves out news", () => {
    const testbed = opp(1, "testbed");
    const call = opp(2, "funding");
    const event = opp(3, "event");
    const news = opp(4, "news");
    const crowded = opp(5, "funding");
    const rows = [
      ...[1, 2].map((c) => kept(c, testbed)),
      ...[1, 2].map((c) => kept(c, call)),
      ...[1, 2].map((c) => kept(c, event)),
      ...[1, 2].map((c) => kept(c, news)),
      ...[1, 2, 3].map((c) => kept(c, crowded)),
    ];
    const shared = sharedOpportunitiesByPair(rows);
    const pair12 = shared.get(`${id(1)}|${id(2)}`)!;
    expect(pair12.opportunities.map((o) => o.id)).toEqual(["opp-1", "opp-2", "opp-3", "opp-5"]);
    expect(pair12.score).toBeCloseTo(1.5 + 1 + 0.5 + 0.5);
    expect(shared.get(`${id(1)}|${id(3)}`)!.score).toBeCloseTo(0.5);
  });

  it("leaves out an opportunity kept for too many members", () => {
    const wide = opp(9, "funding");
    const rows = [1, 2, 3, 4].map((c) => kept(c, wide));
    expect(sharedOpportunitiesByPair(rows, 3).size).toBe(0);
    expect(sharedOpportunitiesByPair(rows, 4).size).toBe(6);
  });

  it("ranks pairs by what they share, then by similarity", () => {
    const shared = new Map([
      [`${id(1)}|${id(2)}`, { score: 1 }],
      [`${id(1)}|${id(3)}`, { score: 2 }],
      [`${id(2)}|${id(3)}`, { score: 1 }],
    ]);
    const similarity = (a: string, b: string) => (a === id(2) && b === id(3) ? 0.9 : 0.1);
    expect(opportunityCandidates(shared, similarity).map((p) => [p.companyAId, p.companyBId])).toEqual([
      [id(1), id(3)],
      [id(2), id(3)],
      [id(1), id(2)],
    ]);
    expect(opportunityCandidates(shared, similarity, { max: 1 })).toHaveLength(1);
  });
});

describe("mergeCandidates", () => {
  const c = (a: number, b: number, similarity: number) => ({ companyAId: id(a), companyBId: id(b), similarity });
  const roles: Record<string, MemberRole> = { [id(1)]: "public", [id(2)]: "maker", [id(3)]: "maker", [id(4)]: "public", [id(5)]: "consultancy", [id(6)]: "consultancy" };
  const roleOf = (x: string) => roles[x];

  it("keeps each pair once with all its reasons, the most reasons first, then the most similar", () => {
    const merged = mergeCandidates({ similar: [c(2, 3, 0.9), c(1, 2, 0.7)], role: [c(1, 2, 0.7), c(1, 3, 0.6)], opportunity: [c(1, 3, 0.6)] }, roleOf);
    expect(merged.map((p) => [p.companyAId, p.companyBId, p.reasons])).toEqual([
      [id(1), id(2), ["similar", "role"]],
      [id(1), id(3), ["role", "opportunity"]],
      [id(2), id(3), ["similar"]],
    ]);
  });

  it("leaves out two users and two consultancies", () => {
    const merged = mergeCandidates({ similar: [c(1, 4, 0.9), c(5, 6, 0.9), c(2, 5, 0.5)], role: [], opportunity: [] }, roleOf);
    expect(merged.map((p) => [p.companyAId, p.companyBId])).toEqual([[id(2), id(5)]]);
  });

  it("caps the list and gives the same order whatever order the sources list their pairs in", () => {
    const sources = { similar: [c(2, 3, 0.5), c(1, 2, 0.5), c(1, 3, 0.5)], role: [], opportunity: [] };
    const reversed = { ...sources, similar: [...sources.similar].reverse() };
    expect(mergeCandidates(reversed, roleOf)).toEqual(mergeCandidates(sources, roleOf));
    expect(mergeCandidates(sources, roleOf, { max: 2 })).toHaveLength(2);
  });
});
