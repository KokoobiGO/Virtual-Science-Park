import { describe, expect, it } from "vitest";
import { claimValueText, publicClaimsOf, type ClaimRow } from "./claims";

const older = new Date("2026-11-01T10:00:00Z");
const newer = new Date("2026-11-10T10:00:00Z");

let next = 0;
const row = (overrides: Partial<ClaimRow>): ClaimRow => ({
  id: `claim-${++next}`,
  companyId: "company-a",
  field: "summary",
  value: "Builds sensors for maritime surveillance.",
  status: "stated",
  visibility: "public",
  reviewState: "active",
  updatedBy: "profiler",
  updatedAt: older,
  ...overrides,
});

describe("publicClaimsOf", () => {
  it("never gives out a private claim", () => {
    const rows = [
      row({ field: "offerings", value: ["Secret prototype"], status: "user_corrected", updatedBy: "user", visibility: "private" }),
      row({ field: "markets", value: ["Navy test ranges"], visibility: "private" }),
      row({ companyId: "company-b", field: "technologies", value: ["Unannounced radar"], visibility: "private", updatedBy: "user", status: "user_confirmed" }),
    ];
    const out = publicClaimsOf(rows);
    expect(out).toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/Secret|Navy test|Unannounced/);
  });

  it("leaves a field out when the member's own private claim is in charge of it", () => {
    const rows = [
      row({ field: "markets", value: ["Military defence"] }),
      row({ field: "markets", value: ["Navy test ranges"], status: "user_corrected", updatedBy: "user", visibility: "private", updatedAt: older }),
    ];
    // The member's private answer wins over the profiler's newer public one, and hides it.
    expect(publicClaimsOf([{ ...rows[0], updatedAt: newer }, rows[1]])).toEqual([]);
  });

  it("keeps active, public, non-missing claims, one per company and field, in field order", () => {
    const summary = row({});
    const tech = row({ field: "technologies", value: ["Hydroacoustics", " Sensor  systems "] });
    const other = row({ companyId: "company-b", field: "offerings", value: ["Ferry services"] });
    const out = publicClaimsOf([tech, other, summary]);
    expect(out).toEqual([
      { id: summary.id, companyId: "company-a", field: "summary", value: "Builds sensors for maritime surveillance." },
      { id: tech.id, companyId: "company-a", field: "technologies", value: "Hydroacoustics, Sensor systems" },
      { id: other.id, companyId: "company-b", field: "offerings", value: "Ferry services" },
    ]);
  });

  it("leaves out missing, empty, superseded, suggested and rejected claims", () => {
    const rows = [
      row({ field: "statedPriorities", value: null, status: "missing" }),
      row({ field: "markets", value: [] }),
      row({ field: "geography", value: ["Karlskrona"], reviewState: "superseded" }),
      row({ field: "offerings", value: ["UV sensors"], reviewState: "suggested" }),
      row({ field: "technologies", value: ["Lidar"], reviewState: "rejected" }),
    ];
    expect(publicClaimsOf(rows)).toEqual([]);
  });

  it("uses the member's public claim over the profiler's, and the newest among equals", () => {
    const profiler = row({ updatedAt: newer });
    const own = row({ value: "We build UV sensors.", status: "user_confirmed", updatedBy: "user", updatedAt: older });
    expect(publicClaimsOf([profiler, own]).map((c) => c.id)).toEqual([own.id]);

    const first = row({ field: "offerings", value: ["Old"], updatedAt: older });
    const second = row({ field: "offerings", value: ["New"], updatedAt: newer });
    expect(publicClaimsOf([second, first]).map((c) => c.value)).toEqual(["New"]);
  });
});

describe("claimValueText", () => {
  it("joins a list with a comma and collapses spaces", () => {
    expect(claimValueText(["Sonar", "  Hydro\nacoustics ", ""])).toBe("Sonar, Hydro acoustics");
    expect(claimValueText("  One   sentence. ")).toBe("One sentence.");
    expect(claimValueText(null)).toBe("");
  });
});
