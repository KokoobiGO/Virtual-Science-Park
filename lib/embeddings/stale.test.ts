import { describe, expect, it } from "vitest";
import { needsNewEmbedding } from "./stale";

describe("needsNewEmbedding", () => {
  const embeddedAt = new Date("2026-11-14T20:00:00Z");

  it("asks for one after a claim changed since the last embedding", () => {
    expect(needsNewEmbedding({ missing: false, claimsChangedAt: new Date("2026-11-14T20:05:00Z"), embeddedAt })).toBe(true);
  });

  it("does not after a priority switch only: the claims are older than the embedding", () => {
    expect(needsNewEmbedding({ missing: false, claimsChangedAt: new Date("2026-11-14T16:00:00Z"), embeddedAt })).toBe(false);
    expect(needsNewEmbedding({ missing: false, claimsChangedAt: embeddedAt, embeddedAt })).toBe(false);
    expect(needsNewEmbedding({ missing: false, claimsChangedAt: null, embeddedAt })).toBe(false);
  });

  it("asks for one when an embedding is missing", () => {
    expect(needsNewEmbedding({ missing: true, claimsChangedAt: null, embeddedAt })).toBe(true);
  });
});
