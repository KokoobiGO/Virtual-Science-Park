import { describe, expect, it } from "vitest";
import { MAX_CANDIDATES, NEIGHBOURS_PER_COMPANY, pairCandidates, type Neighbour } from "./candidates";

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

  it("takes at most four neighbours per company, the nearest", () => {
    const neighbours = [0.5, 0.9, 0.6, 0.8, 0.7, 0.4].map((s, i) => n(1, i + 2, s));
    const pairs = pairCandidates(neighbours);
    expect(NEIGHBOURS_PER_COMPANY).toBe(4);
    expect(pairs.map((p) => p.similarity)).toEqual([0.9, 0.8, 0.7, 0.6]);
  });

  it("keeps the 60 most similar pairs, the most similar first", () => {
    // 40 companies, each with 4 distinct neighbours: far more than 60 pairs.
    const neighbours = Array.from({ length: 40 }, (_, c) => [1, 2, 3, 4].map((k) => n(c, 100 + c * 4 + k, (c * 4 + k) / 1000))).flat();
    const pairs = pairCandidates(neighbours);
    expect(MAX_CANDIDATES).toBe(60);
    expect(pairs).toHaveLength(60);
    expect(pairs[0].similarity).toBe(0.16);
    expect(pairs.at(-1)!.similarity).toBe(0.101);
    expect([...pairs].sort((x, y) => y.similarity - x.similarity)).toEqual(pairs);
    expect(pairCandidates(neighbours, { max: 5 })).toHaveLength(5);
  });
});
