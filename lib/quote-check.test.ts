import { describe, expect, it } from "vitest";
import { extractPage } from "./fetcher/extract";
import { MIN_QUOTE_CHARS, verifyQuote } from "./quote-check";
import { MAX_QUOTE_CHARS } from "./schemas";

/** Stored page text as the fetcher writes it: paragraphs with a blank line between. */
const SNAPSHOT = `Sensorer för sjöbevakning

EmbeddedArt utvecklar UV-sensorer för sjöbevakning, spaning och marina mätstationer.

Vi kallar det ”smart övervakning” – från projekt till produkt på 12 månader.

Våra system används av kunder inom försvar och säkerhet sedan 2009.`;

const found = { found: true };
const notInText = { found: false, reason: "not_in_text" };

describe("verifyQuote: quotes from the page pass", () => {
  it("passes a word-for-word quote", () => {
    expect(verifyQuote("EmbeddedArt utvecklar UV-sensorer för sjöbevakning, spaning och marina mätstationer.", SNAPSHOT)).toEqual(found);
  });

  it("passes with odd spaces, line breaks and non-breaking spaces", () => {
    expect(verifyQuote("  EmbeddedArt  utvecklar\nUV-sensorer\u00A0för sjöbevakning ", SNAPSHOT)).toEqual(found);
  });

  it("passes with straight quotes and a plain hyphen where the page has curly quotes and a dash", () => {
    expect(verifyQuote('Vi kallar det "smart övervakning" - från projekt till produkt', SNAPSHOT)).toEqual(found);
  });

  it("passes with other curly quotes and dashes than the page has", () => {
    expect(verifyQuote("Vi kallar det “smart övervakning” — från projekt till produkt", SNAPSHOT)).toEqual(found);
  });

  it("passes whatever the capitals, and with a separate accent on å ä ö", () => {
    expect(verifyQuote("VÅRA SYSTEM ANVÄNDS AV KUNDER INOM FÖRSVAR", SNAPSHOT)).toEqual(found);
    expect(verifyQuote("Va\u030Ara system anva\u0308nds av kunder inom fo\u0308rsvar", SNAPSHOT)).toEqual(found);
  });

  it("passes a quote wrapped in quote marks or ended early with a full stop", () => {
    expect(verifyQuote("”EmbeddedArt utvecklar UV-sensorer för sjöbevakning.”", SNAPSHOT)).toEqual(found);
  });

  it("passes a quote that runs from a heading into the next paragraph", () => {
    expect(verifyQuote("Sensorer för sjöbevakning EmbeddedArt utvecklar UV-sensorer", SNAPSHOT)).toEqual(found);
  });

  it("passes a quote taken from text the fetcher extracted from HTML", () => {
    const { text } = extractPage(
      `<html><body><main><h1>Om oss</h1><p>Techinova utvecklar och tillverkar <strong>produkter</strong> med elektronik&nbsp;och programvara för kommunikation.</p></main></body></html>`,
    );
    expect(verifyQuote("Techinova utvecklar och tillverkar produkter med elektronik och programvara", text)).toEqual(found);
  });
});

describe("verifyQuote: quotes that are not on the page fail", () => {
  it("fails a made-up quote", () => {
    expect(verifyQuote("EmbeddedArt är världsledande inom autonoma undervattensfarkoster.", SNAPSHOT)).toEqual(notInText);
  });

  it("fails a translated quote", () => {
    expect(verifyQuote("EmbeddedArt develops UV sensors for maritime surveillance, reconnaissance and marine measuring stations.", SNAPSHOT)).toEqual(notInText);
  });

  it("fails a paraphrased quote", () => {
    expect(verifyQuote("EmbeddedArt tar fram UV-sensorer för sjöbevakning, spaning och marina mätstationer.", SNAPSHOT)).toEqual(notInText);
    expect(verifyQuote("UV-sensorer för sjöbevakning utvecklas av EmbeddedArt", SNAPSHOT)).toEqual(notInText);
  });

  it("fails a quote with one word changed or left out", () => {
    expect(verifyQuote("Våra system används av kunder inom försvar och säkerhet sedan 2019", SNAPSHOT)).toEqual(notInText);
    expect(verifyQuote("EmbeddedArt utvecklar sensorer för sjöbevakning", SNAPSHOT)).toEqual(notInText);
  });

  it("fails two real pieces joined with dots", () => {
    expect(verifyQuote("EmbeddedArt utvecklar UV-sensorer ... inom försvar och säkerhet", SNAPSHOT)).toEqual(notInText);
  });

  it("fails a quote that starts or ends inside a word", () => {
    expect(verifyQuote("art utvecklar UV-sensorer för sjöbevakning", SNAPSHOT)).toEqual(notInText);
    expect(verifyQuote("EmbeddedArt utvecklar UV-sensorer för sjöbevak", SNAPSHOT)).toEqual(notInText);
  });

  it("fails against an empty snapshot", () => {
    expect(verifyQuote("EmbeddedArt utvecklar UV-sensorer", "")).toEqual(notInText);
  });
});

describe("verifyQuote: length limits", () => {
  it("fails a quote too short to prove anything", () => {
    expect(verifyQuote("och", SNAPSHOT)).toEqual({ found: false, reason: "too_short" });
    expect(verifyQuote(" ”…” ", SNAPSHOT)).toEqual({ found: false, reason: "too_short" });
    expect(verifyQuote("x".repeat(MIN_QUOTE_CHARS - 1), SNAPSHOT)).toEqual({ found: false, reason: "too_short" });
  });

  it("fails a quote longer than the schema allows, even when it is on the page", () => {
    const long = "ordet ".repeat(80).trim();
    expect(long.length).toBeGreaterThan(MAX_QUOTE_CHARS);
    expect(verifyQuote(long, long)).toEqual({ found: false, reason: "too_long" });
  });
});
