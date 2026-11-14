import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatGoldFile, freshGoldFile, mergeGoldFile, parseGoldFile, readGoldFiles, type ExportClaim, type GoldCompany, type GoldFile } from "./gold-file";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const claim = (n: number, over: Partial<ExportClaim> = {}): ExportClaim => ({
  id: ID(n),
  field: "summary",
  status: "stated",
  value: "Makes sensors.",
  confidence: 1,
  evidence: [{ quote: "Vi gör sensorer.", url: "https://a.example/" }],
  ...over,
});

const company = (claims: ExportClaim[]): GoldCompany => ({ slug: "acme", name: "Acme AB", claims });

const T1 = "2026-11-14T10:00:00.000Z";
const T2 = "2026-11-15T10:00:00.000Z";

describe("freshGoldFile", () => {
  it("puts claims in profile-field order with open verdicts, and sorts the quotes", () => {
    const file = freshGoldFile(
      company([
        claim(1, { field: "geography", value: ["Karlskrona"] }),
        claim(2, { field: "summary" }),
        claim(3, {
          field: "offerings",
          evidence: [
            { quote: "b", url: "https://b.example/" },
            { quote: "z", url: "https://a.example/" },
            { quote: "a", url: "https://a.example/" },
          ],
        }),
        claim(4, { field: "statedPriorities", status: "missing", value: null, confidence: 0, evidence: [] }),
      ]),
      T1,
    );
    expect(file).toMatchObject({ slug: "acme", company: "Acme AB", exportedAt: T1, checkedBy: "" });
    expect(file.howTo).toMatch(/"right" or "wrong"/);
    expect(file.claims.map((c) => c.field)).toEqual(["summary", "offerings", "geography", "statedPriorities"]);
    expect(file.claims.every((c) => c.verdict === null && c.note === "")).toBe(true);
    expect(file.claims[1].evidence.map((e) => e.quote)).toEqual(["a", "z", "b"]);
  });

  it("refuses a status the profiler does not write", () => {
    expect(() => freshGoldFile(company([claim(1, { status: "user_confirmed" })]), T1)).toThrow(/user_confirmed/);
  });
});

describe("mergeGoldFile", () => {
  const checked = (file: GoldFile, verdicts: Record<string, Pick<GoldFile["claims"][number], "verdict" | "note">>): GoldFile => ({
    ...file,
    checkedBy: "Sara",
    claims: file.claims.map((c) => ({ ...c, ...verdicts[c.claimId] })),
  });

  it("adds every claim to a new file", () => {
    const fresh = freshGoldFile(company([claim(1), claim(2, { field: "offerings" })]), T1);
    const merge = mergeGoldFile(null, fresh);
    expect(merge.changed).toBe(true);
    expect(merge.added).toHaveLength(2);
    expect(merge.file).toEqual(fresh);
  });

  it("changes nothing when nothing changed, not even the export date", () => {
    const before = checked(freshGoldFile(company([claim(1), claim(2, { field: "offerings" })]), T1), {
      [ID(1)]: { verdict: "right", note: "" },
    });
    const merge = mergeGoldFile(before, freshGoldFile(company([claim(2, { field: "offerings" }), claim(1)]), T2));
    expect(merge.changed).toBe(false);
    expect(formatGoldFile(merge.file)).toBe(formatGoldFile(before));
    expect(merge.kept).toHaveLength(2);
    expect([merge.reset, merge.added, merge.dropped]).toEqual([[], [], []]);
  });

  it("keeps verdict, note and checkedBy of unchanged claims", () => {
    const before = checked(freshGoldFile(company([claim(1), claim(2, { field: "offerings" })]), T1), {
      [ID(1)]: { verdict: "wrong", note: "The site says radars." },
    });
    const merge = mergeGoldFile(before, freshGoldFile(company([claim(1), claim(2, { field: "offerings" }), claim(3, { field: "markets" })]), T2));
    expect(merge.changed).toBe(true);
    expect(merge.file.exportedAt).toBe(T2);
    expect(merge.file.checkedBy).toBe("Sara");
    expect(merge.file.claims[0]).toMatchObject({ claimId: ID(1), verdict: "wrong", note: "The site says radars." });
    expect(merge.added.map((c) => c.claimId)).toEqual([ID(3)]);
  });

  it("opens the verdict again when the value or the status changed, and keeps the old one", () => {
    const before = checked(freshGoldFile(company([claim(1), claim(2, { field: "markets", value: ["defence"] })]), T1), {
      [ID(1)]: { verdict: "right", note: "" },
      [ID(2)]: { verdict: "wrong", note: "Not on the site." },
    });
    const merge = mergeGoldFile(
      before,
      freshGoldFile(company([claim(1, { value: "Makes radars." }), claim(2, { field: "markets", status: "inferred", value: ["defence"] })]), T2),
    );
    expect(merge.reset.map((c) => c.claimId)).toEqual([ID(1), ID(2)]);
    expect(merge.file.claims[0]).toMatchObject({ verdict: null, previousVerdict: "right", value: "Makes radars." });
    expect(merge.file.claims[1]).toMatchObject({ verdict: null, previousVerdict: "wrong", note: "Not on the site." });
  });

  it("keeps an earlier previousVerdict when a claim changes again before anyone checks it", () => {
    const before = freshGoldFile(company([claim(1)]), T1);
    before.claims[0] = { ...before.claims[0], previousVerdict: "wrong" };
    const merge = mergeGoldFile(before, freshGoldFile(company([claim(1, { value: "Third try." })]), T2));
    expect(merge.file.claims[0]).toMatchObject({ verdict: null, previousVerdict: "wrong" });
  });

  it("compares list values in order", () => {
    const before = freshGoldFile(company([claim(1, { value: ["a", "b"] })]), T1);
    expect(mergeGoldFile(before, freshGoldFile(company([claim(1, { value: ["a", "b"] })]), T2)).reset).toEqual([]);
    expect(mergeGoldFile(before, freshGoldFile(company([claim(1, { value: ["b", "a"] })]), T2)).reset).toHaveLength(1);
  });

  it("drops claims that are no longer active, verdict and all", () => {
    const before = checked(freshGoldFile(company([claim(1), claim(2, { field: "offerings" })]), T1), {
      [ID(2)]: { verdict: "right", note: "" },
    });
    const merge = mergeGoldFile(before, freshGoldFile(company([claim(1), claim(5, { field: "offerings" })]), T2));
    expect(merge.dropped).toMatchObject([{ claimId: ID(2), verdict: "right" }]);
    expect(merge.added.map((c) => c.claimId)).toEqual([ID(5)]);
    expect(merge.file.claims.map((c) => c.claimId)).toEqual([ID(1), ID(5)]);
  });
});

describe("formatGoldFile", () => {
  it("writes a fixed key order, two-space indent and a trailing newline", () => {
    const file = freshGoldFile(company([claim(1)]), T1);
    // Same data, keys in another order.
    const { claims, howTo, ...head } = file;
    const shuffled = { claims: claims.map(({ note, verdict, ...rest }) => ({ note, verdict, ...rest })), howTo, ...head };
    expect(Object.keys(shuffled)[0]).toBe("claims");
    const text = formatGoldFile(shuffled);
    expect(text).toBe(formatGoldFile(file));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.split("\n")[1]).toBe('  "slug": "acme",');
    expect(Object.keys(JSON.parse(text))).toEqual(["slug", "company", "exportedAt", "checkedBy", "howTo", "claims"]);
    expect(Object.keys(JSON.parse(text).claims[0])).toEqual(["claimId", "field", "status", "value", "confidence", "evidence", "verdict", "note"]);
  });

  it("round-trips through parseGoldFile, Swedish letters as they are", () => {
    const file = freshGoldFile(company([claim(1, { value: ["Östersund"] })]), T1);
    file.claims[0].previousVerdict = "right";
    const text = formatGoldFile(file);
    expect(text).toContain("Östersund");
    expect(parseGoldFile(text, "acme.json")).toEqual(file);
  });
});

describe("parseGoldFile", () => {
  const text = (edit: (json: Record<string, unknown> & { claims: Record<string, unknown>[] }) => void) => {
    const json = JSON.parse(formatGoldFile(freshGoldFile(company([claim(1)]), T1)));
    edit(json);
    return JSON.stringify(json);
  };

  it("accepts right, wrong and null", () => {
    for (const verdict of ["right", "wrong", null]) {
      expect(parseGoldFile(text((j) => (j.claims[0].verdict = verdict)), "acme.json").claims[0].verdict).toBe(verdict);
    }
  });

  it("names the file and the problem", () => {
    expect(() => parseGoldFile(text((j) => (j.claims[0].verdict = "Right")), "acme.json")).toThrow(/acme\.json[\s\S]*verdict/);
    expect(() => parseGoldFile(text((j) => (j.claims[0].comment = "hm")), "acme.json")).toThrow(/comment/);
    expect(() => parseGoldFile("{ nope", "acme.json")).toThrow(/acme\.json is not valid JSON/);
  });
});

describe("readGoldFiles", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads every .json file by name, and checks the slug matches", () => {
    dir = mkdtempSync(path.join(tmpdir(), "gold-"));
    const file = freshGoldFile(company([claim(1)]), T1);
    writeFileSync(path.join(dir, "acme.json"), formatGoldFile(file));
    writeFileSync(path.join(dir, "README.txt"), "not a gold file");
    expect(readGoldFiles(dir)).toEqual([file]);
    writeFileSync(path.join(dir, "other.json"), formatGoldFile(file));
    expect(() => readGoldFiles(dir)).toThrow(/must be named acme\.json/);
  });

  it("returns nothing for a missing folder", () => {
    dir = path.join(tmpdir(), "gold-does-not-exist");
    expect(readGoldFiles(dir)).toEqual([]);
  });
});
