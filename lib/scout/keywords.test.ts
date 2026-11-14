import { describe, expect, it } from "vitest";
import { hasSpecific, keywordPlan, keywordScore, keywordTerms, normalizeText, rankByKeywords, searchableText, stemWord, textHas } from "./keywords";

const stem = (word: string) => stemWord(normalizeText(word));

describe("Swedish-aware normalisation", () => {
  it("keeps å, ä and ö and lowers the case, also of a decomposed ä", () => {
    expect(normalizeText("ÖVERVAKNING av Elnätet")).toBe("övervakning av elnätet");
    expect(normalizeText("Elät")).toBe("elät");
    expect(normalizeText("IT-säkerhet, AI och resiliens")).toBe("it säkerhet ai och resiliens");
  });

  it("strips simple Swedish plural and definite endings", () => {
    expect(stem("sensorer")).toBe("sensor");
    expect(stem("sensorerna")).toBe("sensor");
    expect(stem("elnätet")).toBe("elnät");
    expect(stem("elnätets")).toBe("elnät");
    expect(stem("testbäddar")).toBe("testbädd");
    expect(stem("utlysningar")).toBe("utlysning");
    expect(stem("utlysningen")).toBe("utlysning");
    expect(stem("energin")).toBe("energ");
  });

  it("strips English plurals, and English and Swedish forms meet", () => {
    expect(stem("sensors")).toBe("sensor");
    expect(stem("grids")).toBe("grid");
    expect(stem("energy")).toBe(stem("energi"));
    expect(stem("batteries")).toBe("batter");
    expect(stem("batterier")).toBe("batter");
  });

  it("leaves short words and stems alone", () => {
    expect(stem("sensor")).toBe("sensor");
    expect(stem("market")).toBe("market");
    expect(stem("havet")).toBe("havet");
    expect(stem("marin")).toBe("marin");
    expect(stem("safer")).toBe("safer");
  });

  it("matches a stem inside Swedish compounds, and a short term only as a word", () => {
    expect(textHas(searchableText("Cybersäkerhet, AI och resiliens"), "säker")).toBe(true);
    expect(textHas(searchableText("Testbädd för undervattenssensorer"), "sensor")).toBe(true);
    expect(textHas(searchableText("AI Lab Blekinge"), "ai")).toBe(true);
    expect(textHas(searchableText("Clean air for cities"), "ai")).toBe(false);
    expect(textHas(searchableText("North seas"), "sea")).toBe(true);
    expect(textHas(searchableText("Research centres"), "sea")).toBe(false);
  });
});

describe("keywordPlan", () => {
  it("turns English words into bilingual concepts with their tags", () => {
    const plan = keywordPlan("Funding for safer electricity grid technology");
    expect(keywordTerms("Funding for safer electricity grid technology")).toEqual(["safety", "electricity", "grid", "funding"]);
    expect(plan.tags).toEqual(["energy"]);
    const grid = plan.concepts.find((c) => c.key === "grid")!;
    expect(grid.terms).toEqual(expect.arrayContaining(["grid", "elnät", "kraftnät"]));
    expect(plan.concepts.find((c) => c.key === "funding")).toMatchObject({ generic: true });
  });

  it("reads a Swedish question the same way", () => {
    // Specific concepts first, generic ones after.
    expect(keywordTerms("Vilka utlysningar finns för elnätet och cybersäkerhet?")).toEqual(["grid", "cyber security", "call"]);
    expect(keywordPlan("Vilka utlysningar finns för elnätet och cybersäkerhet?").tags).toEqual(["energy", "cyber"]);
  });

  it("finds phrases before words, so cyber security is not also plain security", () => {
    // Plain words count by their stem.
    expect(keywordTerms("AI-based fault location and cyber security for grid owners")).toEqual(["cyber security", "ai", "grid", "fault", "locatio", "owner"]);
    expect(keywordTerms("Which test facilities could fit an underwater sensor?")).toEqual(["underwater", "sensor", "test facility"]);
  });

  it("leaves out function words, numbers and characters a query cannot use", () => {
    expect(keywordTerms("'); drop table x; --")).toEqual(["drop", "table"]);
    expect(keywordTerms("calls in 2027")).toEqual(["call"]);
    expect(hasSpecific(keywordPlan("Which funding calls are open?"))).toBe(false);
    expect(hasSpecific(keywordPlan("underwater"))).toBe(true);
  });
});

/** Real titles from the store (Vinnova, Energimyndigheten, EU Funding & Tenders, the testbed list) on 2026-11-14. */
const ROWS = [
  { id: "vinnova-cyber", title: "Cybersäkerhet, AI och resiliens", description: "Utlysningen ska stärka svensk cybersäkerhet och resiliens med hjälp av AI.", tags: ["cyber", "ai"], closeness: 0.30 },
  { id: "vinnova-cps", title: "Effektiv produktutveckling av cyberfysiska system, genom avancerad digitalisering", description: null, tags: ["ai"], closeness: 0.42 },
  { id: "em-elmarknad", title: "Forskningsmiljö för elmarknadsdesign och reglering", description: "Stöd till en forskningsmiljö om elmarknaden och elnätets reglering.", tags: ["energy"], closeness: 0.25 },
  { id: "em-biogas", title: "Produktionsstöd för biogas 2027", description: "Stöd för produktion av biogas.", tags: ["energy"], closeness: 0.20 },
  { id: "vinnova-startups", title: "Innovativa Startups 2026", description: "Finansiering för unga företag.", tags: [], closeness: 0.50 },
  { id: "vinnova-watchdog", title: "The Baltic Marine Watchdog Challenge", description: "Autonomous systems for sea surveillance.", tags: ["marine", "ai"], closeness: 0.35 },
  { id: "eu-adms", title: "Advanced Distribution Management Systems for distribution grids", description: "Grid operators and DSOs.", tags: ["energy"], closeness: 0.28 },
  { id: "testbed-undervatten", title: "Testbädd för undervattenssensorer i Karlskrona", description: "Testmiljö i havet för sensorer.", tags: ["marine", "sensor"], closeness: 0.10 },
];

const rank = (query: string, limit = 3, fill = true) => rankByKeywords(ROWS, keywordPlan(query), { limit, fill }).map((r) => r.id);

describe("rankByKeywords", () => {
  it("finds a Swedish call for an English question", () => {
    expect(rank("cyber security and AI resilience")[0]).toBe("vinnova-cyber");
    expect(rank("underwater sensor test facility")[0]).toBe("testbed-undervatten");
  });

  it("finds Swedish and English grid calls for an English grid question, before closer unrelated rows", () => {
    // elmarknad (electricity) in the title and elnät (grid) in the text beat "grids" in an English title alone;
    // the biogas call only has the energy tag; the closer startup call matches nothing.
    expect(rank("electricity grid funding")).toEqual(["em-elmarknad", "eu-adms", "em-biogas"]);
  });

  it("ranks a Swedish title first when it says all of an English question", () => {
    const rows = [
      { id: "eu", title: "Energy efficiency and sustainability of AI data processing in Data Centres (IA)", description: null, tags: ["energy", "ai"], closeness: 0.4 },
      { id: "em", title: "Effektiv energianvändning i bebyggelsen för ett hållbart energisystem", description: null, tags: ["energy"], closeness: 0.2 },
      { id: "chips", title: "Chips JU: Test och validering av ny halvledarteknik i pilotlinor", description: null, tags: [], closeness: 0.3 },
    ];
    expect(rankByKeywords(rows, keywordPlan("energy efficiency in buildings"), { limit: 2, fill: false }).map((r) => r.id)).toEqual(["em", "eu"]);
    expect(rankByKeywords(rows, keywordPlan("semiconductor pilot lines"), { limit: 1, fill: false }).map((r) => r.id)).toEqual(["chips"]);
  });

  it("finds an English title for a Swedish question", () => {
    expect(rank("elnät", 2)).toEqual(["eu-adms", "em-elmarknad"]);
    expect(rank("havsövervakning undervattensdrönare marin", 1)).toEqual(["vinnova-watchdog"]);
  });

  it("counts a tag when the text does not say it", () => {
    const plan = keywordPlan("energy");
    const biogas = keywordScore(ROWS.find((r) => r.id === "em-biogas")!, plan);
    const startups = keywordScore(ROWS.find((r) => r.id === "vinnova-startups")!, plan);
    expect(biogas.specific).toBeGreaterThan(0);
    expect(startups.specific).toBe(0);
  });

  it("weighs a title match above the same word in the text, and a domain word above a plain one", () => {
    const plan = keywordPlan("grid");
    expect(keywordScore({ title: "Smart grid pilots", description: null, tags: [] }, plan).specific).toBeGreaterThan(
      keywordScore({ title: "Pilots", description: "for the grid", tags: [] }, plan).specific,
    );
    expect(keywordScore({ title: "Pilots", description: "for the grid", tags: [] }, plan).specific).toBeGreaterThan(
      keywordScore({ title: "Pilots", description: "for the owner", tags: [] }, keywordPlan("owner")).specific,
    );
  });

  it("fills up with the rows closest to the company only when asked", () => {
    expect(rank("cyber drills", 3)).toEqual(["vinnova-cyber", "vinnova-cps", "vinnova-startups"]);
    expect(rank("cyber drills", 3, false)).toEqual(["vinnova-cyber", "vinnova-cps"]);
  });

  it("ranks a query with only generic words by them and closeness, and returns nothing without a company", () => {
    expect(rank("funding calls", 2)).toEqual(["vinnova-startups", "vinnova-cyber"]);
    expect(rank("funding calls", 2, false)).toEqual([]);
  });
});
