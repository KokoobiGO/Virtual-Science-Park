import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { createTranslator } from "@/lib/i18n/translate";
import { INJECTION_LABEL } from "@/lib/injection/detect";
import { NO_WEB_NOTE, type Citation } from "@/lib/scout/types";
import { askFailure, citationStatus, day, euPortalHint, linkCheckText, networkFailure, openFailure, optionKindName, originText, retrievalText, scoutTitle, when, withSiteName } from "./labels";

const EN = createTranslator("en", "scout");
const SV = createTranslator("sv", "scout");

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
    expect(scoutTitle(null, EN)).toBe("Scout");
    expect(scoutTitle("  ", EN)).toBe("Scout");
    expect(scoutTitle("Funding for  safer grids?", EN)).toBe("Funding for safer grids? · Scout");
    const long = scoutTitle("Which test facilities and funding could fit an underwater sensor we want to trial next year?", EN);
    expect(long).toBe("Which test facilities and funding could fit an underwater s… · Scout");
  });

  it("is the same in Swedish: the question as asked, then Scout", () => {
    expect(scoutTitle(null, SV)).toBe("Scout");
    expect(scoutTitle("Finansiering för säkrare elnät?", SV)).toBe("Finansiering för säkrare elnät? · Scout");
  });

  it("keeps the site name the layout added", () => {
    expect(withSiteName("Scout · Virtual Science Park", "Grids · Scout")).toBe("Grids · Scout · Virtual Science Park");
    expect(withSiteName("Old · Scout · Virtual Science Park", "New · Scout")).toBe("New · Scout · Virtual Science Park");
    expect(withSiteName("", "Scout")).toBe("Scout");
  });
});

describe("dates", () => {
  it("are written in the reader's language, in Swedish time", () => {
    expect(day("2026-11-14", "en")).toBe("14 November 2026");
    expect(day("2026-11-14", "sv")).toBe("14 november 2026");
    expect(when("2026-11-14T19:55:00Z", "en")).toBe("14 Nov, 20:55");
    expect(when("2026-11-14T19:55:00Z", "sv")).toBe("14 nov. 20:55");
  });
});

describe("option kinds", () => {
  it("uses the shared kind names, and Web page for a web hit", () => {
    expect(optionKindName("funding", EN)).toBe("Funding call");
    expect(optionKindName("other", EN)).toBe("Web page");
    expect(optionKindName("testbed", SV)).toBe("Testbädd");
    expect(optionKindName("other", SV)).toBe("Webbsida");
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
    expect(citationStatus(citation({ origin: "live", simulated: false, sourceState: "cached" }))).toBeNull();
  });

  it("says when the page read was a stored copy", () => {
    expect(retrievalText(citation(), EN)).toBe("retrieved 14 November 2026");
    expect(retrievalText(citation({ pageRead: true }), EN)).toBe("page read by Scout on 14 November 2026");
    expect(retrievalText(citation({ pageRead: true, pageStored: false }), EN)).toBe("page read by Scout on 14 November 2026");
    expect(retrievalText(citation({ pageRead: true, pageStored: true, retrievedAt: "2026-11-09" }), EN)).toBe("stored copy of the page from 9 November 2026");
  });

  it("says it in Swedish too", () => {
    expect(retrievalText(citation(), SV)).toBe("hämtad 14 november 2026");
    expect(retrievalText(citation({ pageRead: true }), SV)).toBe("sidan lästes av Scout 14 november 2026");
    expect(retrievalText(citation({ pageRead: true, pageStored: true, retrievedAt: "2026-11-09" }), SV)).toBe("sparad kopia av sidan från 9 november 2026");
  });

  it("names a funder's live search and when it answered (B1)", () => {
    const live = citation({ origin: "live", liveSource: "EU Funding & Tenders portal", liveRetrievedAt: "2026-11-14T19:55:00Z" });
    expect(retrievalText(live, EN)).toBe("live result (EU Funding & Tenders portal), retrieved 14 Nov, 20:55");
    expect(retrievalText(live, SV)).toBe("liveresultat (EU Funding & Tenders portal), hämtat 14 nov. 20:55");
    expect(retrievalText({ ...live, liveSource: null }, EN)).toBe("live result, retrieved 14 Nov, 20:55");
    expect(retrievalText({ ...live, liveSource: null }, SV)).toBe("liveresultat, hämtat 14 nov. 20:55");
    // A page Scout read still says so first.
    expect(retrievalText({ ...live, pageRead: true }, EN)).toBe("page read by Scout on 14 November 2026");
    expect(retrievalText(citation({ liveSource: "Vinnova" }), EN)).toBe("retrieved 14 November 2026");
  });

  it("says where each citation came from", () => {
    expect(originText(citation(), EN)).toBe("From the opportunity store");
    expect(originText(citation({ origin: "web" }), EN)).toBe("From web search");
    expect(originText(citation({ origin: "live" }), EN)).toBe("From a funder's live search");
    expect(originText(citation(), SV)).toBe("Från samlingen av möjligheter");
    expect(originText(citation({ origin: "web" }), SV)).toBe("Från webbsökning");
    expect(originText(citation({ origin: "live" }), SV)).toBe("Från en finansiärs livesökning");
  });

  it("words the injection warning as the detector does, and the job's note as the job does", () => {
    expect(en.scout.option.injection).toBe(INJECTION_LABEL);
    expect(en.scout.brief.noWebNote).toBe(NO_WEB_NOTE);
    expect(SV("option.injection")).toBe("Innehåller text som ser ut som instruktioner till en AI; den behandlades som data.");
  });
});

describe("a failed start", () => {
  it("explains a refusal and always says the question is kept", () => {
    const signedOut = askFailure(401, { error: "Sign in first." }, EN);
    expect(signedOut).toMatchObject({ signIn: true, runningId: null });
    expect(signedOut.message).toMatch(/signed out/);

    const busy = askFailure(409, { error: "Scout is still working on your last question.", id: "brief-1" }, EN);
    expect(busy).toMatchObject({ signIn: false, runningId: "brief-1" });
    expect(busy.message).toMatch(/one at a time/);

    expect(askFailure(400, { error: "Ask a question of 10 to 500 characters." }, EN).message).toMatch(/^Ask a question of 10 to 500 characters\./);
    expect(askFailure(403, { error: "Scout is for member companies only." }, EN).message).toBe("Scout is for member companies only.");
    // A body that was not JSON, or a server error with a technical message, gets a plain sentence.
    expect(askFailure(502, { error: "Scout could not be started: fetch failed", id: "x" }, EN).message).toMatch(/^Scout could not be started \(error 502\)/);
    expect(askFailure(500, null, EN).runningId).toBeNull();

    for (const failure of [signedOut, busy, askFailure(400, null, EN), askFailure(502, null, EN), networkFailure(EN)]) {
      if (failure.message !== "Scout is for member companies only.") expect(failure.message).toContain("Your question is still in the box.");
    }
  });

  it("says it all in Swedish, without the API's English sentences", () => {
    const signedOut = askFailure(401, { error: "Sign in first." }, SV);
    expect(signedOut).toMatchObject({ signIn: true, runningId: null });
    expect(signedOut.message).toBe("Du är utloggad, så Scout kunde inte starta. Logga in igen i en ny flik, kom sedan tillbaka hit och tryck på Fråga Scout. Er fråga finns kvar i rutan.");
    const busy = askFailure(409, { error: "Scout is still working on your last question.", id: "brief-1" }, SV);
    expect(busy).toMatchObject({ signIn: false, runningId: "brief-1" });
    expect(busy.message).toMatch(/^Scout arbetar fortfarande med er förra fråga/);
    expect(askFailure(400, { error: "Ask a question of 10 to 500 characters." }, SV).message).toBe("Frågan kunde inte läsas. Er fråga finns kvar i rutan.");
    expect(askFailure(403, { error: "Scout is for member companies only." }, SV).message).toBe("Scout är bara till för medlemsföretag.");
    expect(askFailure(502, { error: "Scout could not be started: fetch failed" }, SV).message).toBe(
      "Scout kunde inte startas (fel 502). Försök igen om en stund. Er fråga finns kvar i rutan.",
    );
    expect(networkFailure(SV).message).toBe("Scout gick inte att nå. Kontrollera anslutningen och försök igen. Er fråga finns kvar i rutan.");
  });
});

describe("a brief that could not be opened", () => {
  it("quotes the API to an English reader, and gives the status in Swedish", () => {
    const notFound = Object.assign(new Error("No such brief."), { status: 404 });
    expect(openFailure(notFound, EN)).toBe("The brief could not be opened (No such brief.). Try again, or reload the page.");
    expect(openFailure(notFound, SV)).toBe("Sammanställningen kunde inte öppnas (fel 404). Försök igen, eller ladda om sidan.");
    expect(openFailure(new TypeError("Failed to fetch"), EN)).toBe("The brief could not be opened (Failed to fetch). Try again, or reload the page.");
    expect(openFailure(new TypeError("Failed to fetch"), SV)).toBe("Sammanställningen kunde inte öppnas (ingen anslutning). Försök igen, eller ladda om sidan.");
  });
});

describe("linkCheckText", () => {
  const page = "https://example.se/facility-1";
  const eu = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-26";
  const checkedAt = "2026-11-14T23:52:00Z";

  it("says when a link was checked live, and that an EU topic was confirmed in the portal's search", () => {
    expect(linkCheckText({ url: page, linkCheck: { outcome: "ok", checkedAt, reason: "" } }, EN)).toEqual({ text: "link checked live 15 Nov, 00:52", confirmed: true });
    expect(linkCheckText({ url: eu, linkCheck: { outcome: "ok", checkedAt, reason: "" } }, EN)?.text).toBe("topic confirmed in the EU portal's search 15 Nov, 00:52");
  });

  it("says why a link is not confirmed", () => {
    expect(linkCheckText({ url: page, linkCheck: { outcome: "blocked", checkedAt, reason: "the site answered 403 to a script" } }, EN)).toEqual({
      text: "link not confirmed on 15 Nov, 00:52: the site answered 403 to a script",
      confirmed: false,
    });
  });

  it("says nothing for a brief stored before the check", () => {
    expect(linkCheckText({ url: page }, EN)).toBeNull();
  });
});

describe("euPortalHint", () => {
  it("is shown for EU portal topic links only", () => {
    expect(euPortalHint("https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-26", EN)).toMatch(/Page not found/);
    expect(euPortalHint("https://www.vinnova.se/e/some-call/", EN)).toBeNull();
  });

  it("says it in Swedish too", () => {
    expect(euPortalHint("https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3-26", SV)).toMatch(/^EU-portalen/);
  });
});
