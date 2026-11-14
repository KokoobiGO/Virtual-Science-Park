import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import sv from "@/messages/sv.json";
import { DEFAULT_LOCALE, HTML_LANG_SCRIPT, LOCALE_COOKIE, localeFromCookieString, parseLocale } from "./config";
import { formatDay, formatDayOrNull } from "./format";
import { createTranslator, interpolate, leafPaths, resolveMessage, selectPlural } from "./translate";

describe("the catalogues", () => {
  it("have exactly the same keys in English and Swedish", () => {
    const english = new Set(leafPaths(en));
    const swedish = new Set(leafPaths(sv));
    expect([...english].filter((k) => !swedish.has(k)), "keys missing in sv.json").toEqual([]);
    expect([...swedish].filter((k) => !english.has(k)), "keys in sv.json that en.json does not have").toEqual([]);
  });

  it("hold only texts: every leaf is a non-empty string", () => {
    for (const [name, catalogue] of [["en", en], ["sv", sv]] as const) {
      const bad = leafPaths(catalogue).filter((k) => k.endsWith("(not a string)"));
      expect(bad, `${name}.json`).toEqual([]);
      for (const path of leafPaths(catalogue)) {
        const value = path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogue);
        expect(typeof value === "string" && value.length > 0, `${name}.json ${path}`).toBe(true);
      }
    }
  });

  it("use the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}|<(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort();
    const read = (catalogue: unknown, path: string) =>
      path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalogue) as string;
    const differ = leafPaths(en).filter((path) => {
      const a = placeholders(read(en, path));
      const b = placeholders(read(sv, path));
      // A Swedish plural form may leave out {count} ("Ett fält ..."), as English "one" forms do.
      return JSON.stringify(a.filter((p) => p !== "count")) !== JSON.stringify(b.filter((p) => p !== "count"));
    });
    expect(differ).toEqual([]);
  });

  it("never call a company eligible, in either language", () => {
    expect(JSON.stringify(en)).not.toMatch(/eligib/i);
    expect(JSON.stringify(sv)).not.toMatch(/berättigad|behörig|eligib/i);
  });

  it("write å, ä and ö as real letters", () => {
    const text = JSON.stringify(sv);
    expect(text).toContain("ä");
    expect(text).toContain("ö");
    expect(text).toContain("å");
    expect(text).not.toMatch(/Ã|\\u00e[456]/);
  });
});

describe("English is the default", () => {
  it("falls back to English for no cookie or an unknown value", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
    expect(parseLocale("de")).toBe("en");
    expect(parseLocale("sv")).toBe("sv");
  });

  it("reads the cookie from document.cookie", () => {
    expect(localeFromCookieString("")).toBeNull();
    expect(localeFromCookieString(`a=1; ${LOCALE_COOKIE}=sv; b=2`)).toBe("sv");
    expect(localeFromCookieString(`${LOCALE_COOKIE}=xx`)).toBe("en");
    expect(localeFromCookieString(`not_${LOCALE_COOKIE}=sv`)).toBeNull();
  });

  it("sets <html lang> only for Swedish in the inline script", () => {
    const run = (cookie: string) => {
      const document = { cookie, documentElement: { lang: "en" } };
      new Function("document", HTML_LANG_SCRIPT)(document);
      return document.documentElement.lang;
    };
    expect(run("")).toBe("en");
    expect(run(`${LOCALE_COOKIE}=sv`)).toBe("sv");
    expect(run(`x=1; ${LOCALE_COOKIE}=en`)).toBe("en");
  });

  it("makes an unknown key a type error", () => {
    const t = createTranslator("en", "layout");
    // @ts-expect-error: not a key of the layout namespace (npm run typecheck fails if this compiles).
    expect(t("noSuchKey")).toBe("layout.noSuchKey");
  });

  it("keeps the English texts the screens printed before", () => {
    const t = createTranslator("en", "layout");
    expect(t("signIn")).toBe("Sign in");
    expect(createTranslator("en", "nav")("week.label")).toBe("Your week");
  });
});

describe("interpolation and plurals", () => {
  it("replaces placeholders and leaves unknown ones", () => {
    expect(interpolate("Read {date}", { date: "14 Nov 2026" })).toBe("Read 14 Nov 2026");
    expect(interpolate("{a} and {b}", { a: "X" })).toBe("X and {b}");
    expect(interpolate("{n} characters", { n: 4231 })).toBe("4231 characters");
  });

  it("picks one, other and zero", () => {
    const forms = { zero: "none", one: "{count} quote", other: "{count} quotes" };
    expect(selectPlural(forms, 0, "en")).toBe("none");
    expect(selectPlural(forms, 1, "en")).toBe("{count} quote");
    expect(selectPlural(forms, 2, "en")).toBe("{count} quotes");
    expect(selectPlural({ one: "1", other: "many" }, 0, "sv")).toBe("many");
    expect(selectPlural({ other: "always" }, 1, "en")).toBe("always");
  });

  it("translates plural entries with count", () => {
    const en_ = createTranslator("en", "profile");
    const sv_ = createTranslator("sv", "profile");
    expect(en_("evidence.summary", { count: 1 })).toBe("Evidence: 1 quote");
    expect(en_("evidence.summary", { count: 3 })).toBe("Evidence: 3 quotes");
    expect(sv_("evidence.summary", { count: 3 })).toBe("Belägg: 3 citat");
    expect(createTranslator("en", "compare")("shared", { count: 0 })).toBe("No opportunity is in both top fives.");
    expect(createTranslator("sv", "dataStatus")("panel.counts.cached", { count: 2 })).toBe("2 sparade kopior");
  });

  it("falls back to English, then to the key", () => {
    expect(resolveMessage("sv", "no.such.key")).toBe("no.such.key");
    expect(resolveMessage("sv", "layout.signIn")).toBe("Logga in");
  });

  it("renders tags and element placeholders with t.rich", () => {
    const t = createTranslator("en", "profile");
    const node = t.rich("list.empty", { link: (chunk) => createElement("a", { href: "/staff/checks" }, chunk) });
    expect(renderToStaticMarkup(createElement("p", null, node))).toBe(
      '<p>No member companies yet. Run the member import under <a href="/staff/checks">Service checks</a> to read BSP&#x27;s member list.</p>',
    );
    const time = createElement("time", { dateTime: "2026-11-14" }, "14 Nov 2026");
    expect(renderToStaticMarkup(createElement("span", null, t.rich("updated", { date: time })))).toBe(
      '<span>Updated <time dateTime="2026-11-14">14 Nov 2026</time></span>',
    );
  });
});

describe("dates in Swedish time", () => {
  it("prints the day in the reader's language", () => {
    // 23:30 UTC on 9 Nov is already 10 Nov in Stockholm.
    expect(formatDay("2026-11-09T23:30:00Z", "en")).toBe("10 Nov 2026");
    expect(formatDay("2026-11-09T23:30:00Z", "sv")).toBe("10 nov. 2026");
    expect(formatDayOrNull("not a date", "sv")).toBeNull();
    expect(formatDayOrNull(null, "en")).toBeNull();
  });
});
