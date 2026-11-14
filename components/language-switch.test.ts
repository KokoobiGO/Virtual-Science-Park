import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/client";

// The server action only runs on a press; the markup does not need it.
vi.mock("@/app/actions/locale", () => ({ setLocale: vi.fn() }));

const { LanguageSwitch } = await import("./language-switch");
const { RouteError } = await import("./route-error");
const { ClaimBadge } = await import("./claim-badge");
const { DataStatusLabel } = await import("./data-status-label");

describe("LanguageSwitch (C19)", () => {
  it("offers English / Svenska as two named buttons in a labelled group, the current one pressed", () => {
    const html = renderToStaticMarkup(createElement(LanguageSwitch, { locale: "sv", label: "Språk" }));
    expect(html).toContain('role="group" aria-label="Språk"');
    const buttons = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attrs, name]) => ({ attrs, name }));
    expect(buttons.map((b) => b.name)).toEqual(["English", "Svenska"]);
    for (const [i, value] of ["en", "sv"].entries()) {
      const { attrs } = buttons[i];
      expect(attrs).toContain('type="submit"');
      expect(attrs).toContain('name="locale"');
      expect(attrs).toContain(`value="${value}"`);
      expect(attrs).toContain(`lang="${value}"`);
      expect(attrs).toContain(`aria-pressed="${value === "sv"}"`);
    }
  });
});

describe("shared pieces default to English", () => {
  it("RouteError is English without a provider and Swedish inside one", () => {
    const props = { error: Object.assign(new Error("x"), { digest: "123" }), retry: () => {} };
    const english = renderToStaticMarkup(createElement(RouteError, props));
    expect(english).toContain("This page could not be loaded");
    expect(english).toContain("Try again in a moment. If it keeps happening, tell BSP staff and give them this reference:");
    expect(english).toContain(">Go to the start page<");

    const swedish = renderToStaticMarkup(
      // The provider's props type requires children, so they go in the props here (tests are .ts, without JSX).
      // eslint-disable-next-line react/no-children-prop
      createElement(LocaleProvider, { locale: "sv", children: createElement(RouteError, { ...props, page: "compare" }) }),
    );
    expect(swedish).toContain("Jämförelsen kunde inte läsas in");
    expect(swedish).toContain(">Försök igen<");
    expect(swedish).toContain(">Börja en ny jämförelse<");
  });

  it("keeps the English title and label that a screen passes in", () => {
    const html = renderToStaticMarkup(
      createElement(RouteError, { error: null, retry: () => {}, title: "Explore could not be loaded", back: { href: "/", label: "Back" } }),
    );
    expect(html).toContain("Explore could not be loaded");
    expect(html).toContain(">Back<");
  });

  it("badges and labels speak English unless given a locale", () => {
    expect(renderToStaticMarkup(createElement(ClaimBadge, { status: "inferred" }))).toContain("Inferred");
    expect(renderToStaticMarkup(createElement(ClaimBadge, { status: "inferred", locale: "sv" }))).toContain("Härlett");
    expect(renderToStaticMarkup(createElement(DataStatusLabel, { kind: "cached", date: "2026-11-10T02:00:00Z" }))).toContain(
      "Cached copy · 10 Nov 2026",
    );
    expect(renderToStaticMarkup(createElement(DataStatusLabel, { kind: "cached", date: "2026-11-10T02:00:00Z", locale: "sv" }))).toContain(
      "Sparad kopia · 10 nov. 2026",
    );
  });
});
