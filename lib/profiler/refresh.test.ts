import { describe, expect, it } from "vitest";
import { isChangedClaim, type ComparableClaim } from "./refresh";

const claim = (value: ComparableClaim["value"], quotes: string[], status: ComparableClaim["status"] = "stated"): ComparableClaim => ({
  value,
  status,
  quotes,
});
const missing = claim(null, [], "missing");

describe("isChangedClaim", () => {
  it("does not count a reworded value with the same quotes as a change", () => {
    const old = claim("Makes underwater sensors.", ["Vi tillverkar undervattenssensorer."]);
    const next = claim("Builds sensors for use under water.", ["Vi tillverkar undervattenssensorer."]);
    expect(isChangedClaim(old, next)).toBe(false);
  });

  it("counts a new value with a new quote as a change", () => {
    const old = claim(["Sonar"], ["Vi bygger sonarer."]);
    const next = claim(["Sonar", "Lidar"], ["Vi bygger sonarer.", "Nu även lidar för hamnar."]);
    expect(isChangedClaim(old, next)).toBe(true);
  });

  it("does not count the same list in another order as a change", () => {
    const old = claim(["Sonar", "Lidar", "Radar"], ["Sonar, lidar och radar."]);
    const next = claim(["Radar", "Sonar", "Lidar"], ["Radar och sonar.", "Även lidar."]);
    expect(isChangedClaim(old, next)).toBe(false);
  });

  it("does not count a value that became missing as a change", () => {
    expect(isChangedClaim(claim(["Sonar"], ["Vi bygger sonarer."]), missing)).toBe(false);
    // A "stated" claim with an empty list says nothing either.
    expect(isChangedClaim(claim(["Sonar"], ["Vi bygger sonarer."]), claim([], ["Något."]))).toBe(false);
  });

  it("counts a value where the old claim was missing as a change", () => {
    expect(isChangedClaim(missing, claim(["Sonar"], ["Vi bygger sonarer."]))).toBe(true);
  });

  it("counts a value where there was no old claim as a change", () => {
    expect(isChangedClaim(null, claim(["Sonar"], ["Vi bygger sonarer."]))).toBe(true);
  });

  it("does not count text that differs only in spacing, capitals and quote marks as a change", () => {
    const old = claim(["Smart “blue” sensors"], ["Vi säljer ”smarta” sensorer."]);
    const next = claim(["  smart  \"Blue\" sensors "], ["vi  säljer \"smarta\" SENSORER."]);
    expect(isChangedClaim(old, next)).toBe(false);
  });

  it("does not count a new value without a new quote as a change", () => {
    const old = claim(["Sonar"], ["Vi bygger sonarer.", "Vi bygger även lidar."]);
    const next = claim(["Sonar", "Lidar"], ["Vi bygger även lidar."]);
    expect(isChangedClaim(old, next)).toBe(false);
  });

  it("does not count the same value with a new quote as a change", () => {
    const old = claim("Makes sensors.", ["Vi gör sensorer."]);
    const next = claim("Makes sensors.", ["Vi gör sensorer.", "Sensorer är vår sak."]);
    expect(isChangedClaim(old, next)).toBe(false);
  });

  it("compares a one-sentence summary with a one-item list as the same value", () => {
    expect(isChangedClaim(claim("Makes sensors.", ["A."]), claim(["makes sensors."], ["B."]))).toBe(false);
  });
});
