import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("keeps å, ä and ö, in lower case", () => {
    expect(normalizeText("Mätstationer i Östersjön och Åland")).toBe("mätstationer i östersjön och åland");
  });

  it("joins a letter and its separate accent into one character (NFC)", () => {
    const decomposed = "sjöbevakning på Öland"; // o + ¨, a + ˚, O + ¨
    expect(decomposed).not.toBe("sjöbevakning på Öland");
    expect(normalizeText(decomposed)).toBe("sjöbevakning på öland");
  });

  it("squashes spaces, tabs, line breaks and non-breaking spaces to one space", () => {
    expect(normalizeText("  Vi  bygger\tsensorer\n\nför sjöbevakning \r\n")).toBe("vi bygger sensorer för sjöbevakning");
  });

  it("uses one kind of quote mark", () => {
    const expected = "'smart' elnät, kundens 'bästa' val";
    for (const typed of [
      "”smart” elnät, kundens ”bästa” val", // Swedish
      "“smart” elnät, kundens ‘bästa’ val", // English curly
      "»smart» elnät, kundens «bästa» val", // guillemets
      '"smart" elnät, kundens `bästa´ val', // straight and accents
    ]) {
      expect(normalizeText(typed)).toBe(expected);
    }
    expect(normalizeText("Techinova’s products")).toBe("techinova's products");
  });

  it("uses one kind of dash", () => {
    for (const dash of ["-", "‐", "‑", "‒", "–", "—", "―", "−"]) {
      expect(normalizeText(`UV${dash}sensorer 2009${dash}2026`)).toBe("uv-sensorer 2009-2026");
    }
  });

  it("drops invisible characters and writes an ellipsis as three dots", () => {
    expect(normalizeText("sjö­bevak​ning﻿ …")).toBe("sjöbevakning ...");
  });

  it("gives the same result when run twice", () => {
    const once = normalizeText("  ”Från  projekt – till produkt”… ");
    expect(normalizeText(once)).toBe(once);
  });

  it("returns an empty string for only white space", () => {
    expect(normalizeText(" \n\t ")).toBe("");
  });
});
