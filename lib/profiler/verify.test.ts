import { describe, expect, it } from "vitest";
import { ProfileField } from "../schemas";
import { MAX_QUOTES_PER_FIELD, missingClaim, parseProfilerReply, profilerJsonSchema, toDraftClaims, type DraftClaim } from "./output";
import type { ProfilerSource } from "./prompt";
import { mergeRetry, retryFeedback, verifyDraftClaims } from "./verify";

const SNAPSHOT = "0b1f8f7e-1b0a-4c0e-9a59-6a0e7d2f9d11";
const TEXT = "EmbeddedArt utvecklar UV-sensorer för sjöbevakning, spaning och marina mätstationer.\n\nVi stödjer försvaret med tekniska tjänster.";
const texts = new Map([[SNAPSHOT, TEXT]]);

const quote = (text: string) => ({ snapshotId: SNAPSHOT, url: "https://embeddedart.se/", quote: text, quoteLang: "sv" as const });
const claim = (field: ProfileField, quotes: string[], value: string | string[] = ["x"]): DraftClaim => ({
  field,
  value,
  status: "stated",
  confidence: 0.8,
  evidence: quotes.map(quote),
});

const REAL = "EmbeddedArt utvecklar UV-sensorer för sjöbevakning";
const REAL_2 = "Vi stödjer försvaret med tekniska tjänster.";
const TRANSLATED = "EmbeddedArt develops UV sensors for maritime surveillance";

describe("verifyDraftClaims", () => {
  const checked = verifyDraftClaims(
    [
      claim("summary", [REAL], "Develops UV sensors."),
      claim("offerings", [REAL, TRANSLATED]),
      claim("markets", [TRANSLATED]),
      claim("geography", []),
      missingClaim("technologies"),
    ],
    texts,
  );
  const byField = (field: string) => checked.claims.find((c) => c.field === field)!;

  it("keeps the quotes that are in the snapshot and drops the ones that are not", () => {
    expect(byField("summary").evidence.map((e) => e.quote)).toEqual([REAL]);
    expect(byField("offerings").evidence.map((e) => e.quote)).toEqual([REAL]);
    expect(byField("markets").evidence).toEqual([]);
  });

  it("fails a stated claim with no quote left, with the quotes it tried", () => {
    expect(checked.failed).toEqual([
      { field: "markets", quotes: [TRANSLATED] },
      { field: "geography", quotes: [] },
    ]);
  });

  it("leaves a missing claim alone and counts the quotes", () => {
    expect(byField("technologies")).toEqual(missingClaim("technologies"));
    expect(checked.quotes).toEqual({ found: 2, total: 4 });
  });

  it("fails a quote whose snapshot is unknown", () => {
    const other = verifyDraftClaims([{ ...claim("summary", [REAL]), evidence: [{ ...quote(REAL), snapshotId: "unknown" }] }], texts);
    expect(other.failed.map((f) => f.field)).toEqual(["summary"]);
  });
});

describe("retryFeedback", () => {
  it("names each failed field with the quotes that were not found", () => {
    const feedback = retryFeedback([
      { field: "markets", quotes: [TRANSLATED] },
      { field: "geography", quotes: [] },
    ]);
    expect(feedback).toContain(`- markets: not in any source word for word: "${TRANSLATED}"`);
    expect(feedback).toContain("- geography: no quote was given");
    expect(feedback).toContain("Answer again for these fields only");
  });
});

describe("mergeRetry", () => {
  const first = verifyDraftClaims(
    [claim("summary", [REAL], "Develops UV sensors."), claim("markets", [TRANSLATED]), claim("offerings", [TRANSLATED]), claim("geography", [TRANSLATED])],
    texts,
  );

  it("drops every failed claim to missing when there was no retry", () => {
    const { claims, dropped } = mergeRetry(first, null);
    expect(dropped).toEqual(["markets", "offerings", "geography"]);
    expect(claims.map((c) => c.status)).toEqual(["stated", "missing", "missing", "missing"]);
  });

  it("takes a retried claim that passed, and drops one that failed again or came back missing", () => {
    const retry = verifyDraftClaims([claim("markets", [REAL_2], ["Defence"]), claim("offerings", [TRANSLATED]), missingClaim("geography")], texts);
    const { claims, dropped } = mergeRetry(first, retry);

    expect(dropped).toEqual(["offerings", "geography"]);
    expect(claims.find((c) => c.field === "markets")).toMatchObject({ value: ["Defence"], status: "stated", evidence: [{ quote: REAL_2 }] });
    expect(claims.find((c) => c.field === "offerings")).toEqual(missingClaim("offerings"));
    expect(claims.find((c) => c.field === "geography")).toEqual(missingClaim("geography"));
  });

  it("never touches a claim that passed the first time", () => {
    const retry = verifyDraftClaims([claim("summary", [REAL_2], "Something else.")], texts);
    expect(mergeRetry(first, retry).claims.find((c) => c.field === "summary")?.value).toBe("Develops UV sensors.");
  });

  it("drops a failed claim the retry left out", () => {
    expect(mergeRetry(first, verifyDraftClaims([], texts)).dropped).toEqual(["markets", "offerings", "geography"]);
  });
});

describe("a retry for some fields only", () => {
  const source: ProfilerSource = { snapshotId: SNAPSHOT, source: "company_site", url: "https://embeddedart.se/", lang: "sv", text: TEXT };
  const answer = { status: "stated", evidence: [{ source: "S1", quote: REAL_2 }], values: ["Defence"], confidence: 0.7 };

  it("asks for those fields only, with at most three quotes each", () => {
    const schema = profilerJsonSchema(["markets", "geography"]) as {
      required: string[];
      properties: Record<string, { properties: { evidence: { maxItems: number } } }>;
    };
    expect(schema.required).toEqual(["markets", "geography"]);
    expect(schema.properties.markets.properties.evidence.maxItems).toBe(MAX_QUOTES_PER_FIELD);
  });

  it("parses an answer with those fields and gives draft claims for them only", () => {
    const output = parseProfilerReply(JSON.stringify({ markets: answer }), ["markets"]);
    expect(toDraftClaims(output, [source]).map((c) => c.field)).toEqual(["markets"]);
    expect(() => parseProfilerReply("{}", ["markets"])).toThrow();
  });

  it("keeps three quotes at most, even when the model gives more", () => {
    const many = { ...answer, evidence: Array.from({ length: 6 }, () => ({ source: "S1", quote: REAL_2 })) };
    const [draft] = toDraftClaims(parseProfilerReply(JSON.stringify({ markets: many }), ["markets"]), [source]);
    expect(draft.evidence).toHaveLength(MAX_QUOTES_PER_FIELD);
  });
});
