import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/scout/types";
import { askFailure, citationStatus, NETWORK_FAILURE, retrievalText, scoutTitle, withSiteName } from "./labels";

const citation = (extra: Partial<Citation> = {}): Citation => ({
  url: "https://example.se/x",
  title: "X",
  retrievedAt: "2026-11-14",
  origin: "store",
  sourceName: "Vinnova",
  pageRead: false,
  ...extra,
});

describe("page titles", () => {
  it("names the open brief, cut, and Scout", () => {
    expect(scoutTitle(null)).toBe("Scout");
    expect(scoutTitle("  ")).toBe("Scout");
    expect(scoutTitle("Funding for  safer grids?")).toBe("Funding for safer grids? · Scout");
    const long = scoutTitle("Which test facilities and funding could fit an underwater sensor we want to trial next year?");
    expect(long).toBe("Which test facilities and funding could fit an underwater s… · Scout");
  });

  it("keeps the site name the layout added", () => {
    expect(withSiteName("Scout · Virtual Science Park", "Grids · Scout")).toBe("Grids · Scout · Virtual Science Park");
    expect(withSiteName("Old · Scout · Virtual Science Park", "New · Scout")).toBe("New · Scout · Virtual Science Park");
    expect(withSiteName("", "Scout")).toBe("Scout");
  });
});

describe("citation labels (D20)", () => {
  it("labels hand-entered and cached store rows, and nothing else", () => {
    expect(citationStatus(citation({ simulated: true, sourceState: "simulated" }))).toEqual({ kind: "hand_entered", date: null });
    expect(citationStatus(citation({ simulated: false, sourceState: "simulated" }))).toEqual({ kind: "hand_entered", date: null });
    expect(citationStatus(citation({ simulated: false, sourceState: "cached", sourceCachedAt: "2026-11-10T02:00:00Z" }))).toEqual({
      kind: "cached",
      date: "2026-11-10T02:00:00Z",
    });
    // Without the copy's date, the date the row was retrieved.
    expect(citationStatus(citation({ simulated: false, sourceState: "cached" }))).toEqual({ kind: "cached", date: "2026-11-14" });
    expect(citationStatus(citation({ simulated: false, sourceState: "live" }))).toBeNull();
    // Briefs stored before citations carried a status, and web hits, get no label.
    expect(citationStatus(citation())).toBeNull();
    expect(citationStatus(citation({ origin: "web", simulated: false, sourceState: "cached" }))).toBeNull();
  });

  it("says when the page read was a stored copy", () => {
    expect(retrievalText(citation())).toBe("retrieved 14 November 2026");
    expect(retrievalText(citation({ pageRead: true }))).toBe("page read by Scout on 14 November 2026");
    expect(retrievalText(citation({ pageRead: true, pageStored: false }))).toBe("page read by Scout on 14 November 2026");
    expect(retrievalText(citation({ pageRead: true, pageStored: true, retrievedAt: "2026-11-09" }))).toBe("stored copy of the page from 9 November 2026");
  });
});

describe("a failed start", () => {
  it("explains a refusal and always says the question is kept", () => {
    const signedOut = askFailure(401, { error: "Sign in first." });
    expect(signedOut).toMatchObject({ signIn: true, runningId: null });
    expect(signedOut.message).toMatch(/signed out/);

    const busy = askFailure(409, { error: "Scout is still working on your last question.", id: "brief-1" });
    expect(busy).toMatchObject({ signIn: false, runningId: "brief-1" });
    expect(busy.message).toMatch(/one at a time/);

    expect(askFailure(400, { error: "Ask a question of 10 to 500 characters." }).message).toMatch(/^Ask a question of 10 to 500 characters\./);
    expect(askFailure(403, { error: "Scout is for member companies only." }).message).toBe("Scout is for member companies only.");
    // A body that was not JSON, or a server error with a technical message, gets a plain sentence.
    expect(askFailure(502, { error: "Scout could not be started: fetch failed", id: "x" }).message).toMatch(/^Scout could not be started \(error 502\)/);
    expect(askFailure(500, null).runningId).toBeNull();

    for (const failure of [signedOut, busy, askFailure(400, null), askFailure(502, null), NETWORK_FAILURE]) {
      if (failure.message !== "Scout is for member companies only.") expect(failure.message).toContain("Your question is still in the box.");
    }
  });
});
