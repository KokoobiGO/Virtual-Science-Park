import { describe, expect, it } from "vitest";
import { quoteInContext } from "./evidence";

const PAGE = [
  "Välkommen till EmbeddedArt",
  "",
  "Vi har lång och bred erfarenhet inom produktutveckling, hydroakustik och sensorsystem.",
  "Produktportföljen består av UV-sensorer och tekniska system för sjöbevakning, spaning och marina mätstationer.",
  "Kontakta oss",
].join("\n");

describe("quoteInContext", () => {
  it("finds a Swedish quote and returns the page text around it", () => {
    const found = quoteInContext(PAGE, "Produktportföljen består av UV-sensorer och tekniska system för sjöbevakning, spaning och marina mätstationer.");
    expect(found).not.toBeNull();
    expect(found!.match).toBe("Produktportföljen består av UV-sensorer och tekniska system för sjöbevakning, spaning och marina mätstationer");
    expect(found!.before).toMatch(/hydroakustik och sensorsystem\. $/);
    expect(found!.after).toBe(". Kontakta oss");
  });

  it("finds the quote despite different spacing, quote marks, dashes and capitals, and shows the page's own text", () => {
    const page = "Intro text. Vi säger ”hej” till  havet – varje dag. Slut.";
    const found = quoteInContext(page, 'vi säger "hej" till havet - varje dag');
    expect(found?.match).toBe("Vi säger ”hej” till havet – varje dag");
    expect(found?.before).toBe("Intro text. ");
  });

  it("only matches whole words", () => {
    expect(quoteInContext("We are smart people building things.", "art people building")).toBeNull();
    expect(quoteInContext("Smart art people building things.", "art people building")?.before).toBe("Smart ");
  });

  it("returns null for a quote that is not on the page", () => {
    expect(quoteInContext(PAGE, "Vi bygger ubåtar för turister.")).toBeNull();
    expect(quoteInContext(PAGE, "  ")).toBeNull();
  });

  it("cuts long context at a word and says it did", () => {
    const filler = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const page = `${filler} the quoted sentence is here ${filler}`;
    const found = quoteInContext(page, "the quoted sentence is here", 40)!;
    expect(found.cutBefore).toBe(true);
    expect(found.cutAfter).toBe(true);
    expect(found.before.length).toBeLessThanOrEqual(40);
    expect(found.after.length).toBeLessThanOrEqual(40);
    expect(found.before).toMatch(/^word\d+ /);
    expect(found.after).toMatch(/ word\d+$/);
  });

  it("does not cut when the page is short", () => {
    const found = quoteInContext("Short page with the quote in it.", "the quote")!;
    expect(found).toMatchObject({ before: "Short page with ", match: "the quote", after: " in it.", cutBefore: false, cutAfter: false });
  });

  it("keeps the characters around invisible ones and the ellipsis", () => {
    const found = quoteInContext("Sensor­system för havet… och mer.", "sensorsystem för havet... och mer");
    expect(found?.match).toBe("Sensor­system för havet… och mer");
    expect(found?.after).toBe(".");
  });
});
