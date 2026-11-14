import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PENDING_TEXT, type WeekStatusJson } from "@/lib/week/live";
import { WeekLive } from "./week-live";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const status = (over: Partial<WeekStatusJson> = {}): WeekStatusJson => ({
  weekOf: "2026-11-09",
  builtAt: "2026-11-14T20:00:00.000Z",
  profileChangedAt: "2026-11-14T19:00:00.000Z",
  pending: false,
  ...over,
});

const items = [
  { key: "opportunity:b", card: createElement("article", null, "Card B") },
  { key: "trend:t", card: createElement("article", null, "Trend T") },
];

const render = (props: Parameters<typeof WeekLive>[0]) => renderToStaticMarkup(createElement(WeekLive, props));

describe("WeekLive", () => {
  it("lists the cards in the stored order, keyed by what survives a rebuild", () => {
    const html = render({ companyId: "c1", status: status(), items });
    expect(html.indexOf('data-key="opportunity:b"')).toBeLessThan(html.indexOf('data-key="trend:t"'));
    expect(html).toContain("Card B");
    expect(html).not.toContain(PENDING_TEXT);
  });

  it("says the cards are being re-ranked while a profile change waits for them", () => {
    const html = render({ companyId: "c1", status: status({ pending: true }), items });
    expect(html).toContain('role="status"');
    expect(html).toContain(PENDING_TEXT);
  });

  it("shows the empty state without cards", () => {
    const html = render({ companyId: "c1", status: status({ weekOf: null, builtAt: null }), items: [], empty: createElement("p", null, "No cards yet") });
    expect(html).toContain("No cards yet");
    expect(html).not.toContain("<ol");
  });
});
