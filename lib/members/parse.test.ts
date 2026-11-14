import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMemberPage } from "./parse";

/** Real member pages recorded on 2026-11-14, cut down to the member template. */
const fixture = (slug: string) => readFileSync(new URL(`./fixtures/${slug}.html`, import.meta.url), "utf8");

describe("parseMemberPage", () => {
  it("reads every fact from a member page, with several towns and Swedish characters", () => {
    const facts = parseMemberPage(fixture("kustbevakningen"));
    expect(facts).toMatchObject({
      name: "Kustbevakningen",
      industry: "Offentlig verksamhet",
      employees: "200+",
      foundedYear: 1989,
      town: "Göteborg, Hönösand, Karlskrona, Malmö, Nyköping, Stockholm",
      website: "https://www.kustbevakningen.se/",
    });
    expect(facts.description).toMatch(/^Ansvarar för sjöövervakning, miljöräddningstjänst till sjöss/);
    expect(facts.description).not.toContain("Fler medlemmar");
  });

  it("keeps the other facts in place when one value is empty", () => {
    const facts = parseMemberPage(fixture("dnv-cyber"));
    expect(facts).toMatchObject({
      name: "DNV Cyber",
      industry: "Cybersäkerhet",
      employees: null,
      foundedYear: 2024,
      town: "Karlskrona",
      website: "https://www.dnv.com/cyber/",
    });
  });

  it("does not take facts from the 'more members' cards below", () => {
    const facts = parseMemberPage(fixture("dnv-cyber"));
    expect(facts.industry).toBe("Cybersäkerhet");
  });

  it("reads facts by label, so a different order and a missing website still work", () => {
    const facts = parseMemberPage(`
      <div data-elementor-type="single-post">
        <h1>Exempel AB</h1>
        <div data-widget_type="text-editor.default"><p>Exempel AB bygger   mätstationer.</p></div>
        <ul><li>Ort</li><li>Webb</li><li>Grundat</li></ul>
        <ul><li>Ronneby</li><li></li><li>okänt</li></ul>
      </div>`);
    expect(facts).toEqual({
      name: "Exempel AB",
      description: "Exempel AB bygger mätstationer.",
      industry: null,
      employees: null,
      foundedYear: null,
      town: "Ronneby",
      website: null,
    });
  });

  it("returns nulls for a page that is not a member page", () => {
    const facts = parseMemberPage("<html><body><p>Sidan kunde inte hittas.</p></body></html>");
    expect(facts.name).toBeNull();
    expect(facts.website).toBeNull();
  });
});
