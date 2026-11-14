import { describe, expect, it } from "vitest";
import { buildDigest, countsText, escapeHtml, weekPageUrl, type DigestCard } from "./digest";

const now = new Date("2026-11-14T10:00:00Z");
const SITE = "https://vsp.example.org";

function matchCard(over: Partial<DigestCard> = {}): DigestCard {
  return {
    position: 1,
    kind: "match",
    title: "Maritime sensor testbed call",
    why: "You build underwater sensors and the call funds sea trials.",
    nextStep: "Read the call text and list which trials you could run.",
    uncertainties: ["The text does not say whether small companies can lead."],
    sources: [{ url: "https://www.vinnova.se/e/maritime-2026", title: "Maritime sensor testbed call" }],
    opportunity: {
      kind: "funding",
      source: "Vinnova",
      url: "https://www.vinnova.se/e/maritime-2026",
      deadline: new Date("2026-12-03T13:00:00Z"),
      eventDate: null,
      simulated: false,
      externalId: "vinnova-maritime-2026",
      sourceState: "live",
      cachedAt: null,
    },
    trendArea: null,
    ...over,
  };
}

function trendCard(over: Partial<DigestCard> = {}): DigestCard {
  return {
    position: 2,
    kind: "trend",
    title: "Marine: two new calls close in December",
    why: "Two calls for marine technology opened this week.\nBoth close before 15 Dec 2026.",
    nextStep: "Read the sources and see whether it changes your plans.",
    uncertainties: [],
    sources: [
      { url: "https://bluesciencepark.se/news/a", title: "BSP news A" },
      { url: "https://www.energimyndigheten.se/x" },
    ],
    opportunity: null,
    trendArea: "marine",
    ...over,
  };
}

const digest = (cards: DigestCard[], companyName = "EmbeddedArt") =>
  buildDigest({ companyName, weekOf: "2026-11-09", cards, siteUrl: SITE, now });

describe("escapeHtml", () => {
  it("escapes the five characters that matter in HTML", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("buildDigest", () => {
  it("sends nothing for an empty week", () => {
    expect(digest([])).toBeNull();
  });

  it("shows a match card with its label, kind, source, date, why, next step, doubts and link", () => {
    const email = digest([matchCard()])!;
    expect(email.subject).toBe("Your week, 9 Nov 2026: 1 potential match for EmbeddedArt");
    for (const part of [
      "Potential match",
      "Funding call",
      "Vinnova",
      "Maritime sensor testbed call",
      "Deadline: <strong>3 Dec 2026, 14:00</strong>",
      "Why it fits",
      "You build underwater sensors",
      "Next step",
      "What is uncertain",
      "small companies can lead",
      'href="https://www.vinnova.se/e/maritime-2026"',
      'href="https://vsp.example.org/week"',
      "Information only.",
      "<strong>Potential match</strong>", // in the footer's label list
    ]) {
      expect(email.html).toContain(part);
    }
    expect(email.html).not.toMatch(/\beligible\b/i);
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toMatch(/<link\b/);
  });

  it("labels a live opportunity with nothing, and explains no data label it does not use", () => {
    const real = digest([matchCard()])!;
    expect(real.html).not.toContain('class="vsp-sim"');
    expect(real.html).not.toContain('class="vsp-cache"');
    expect(real.text).not.toMatch(/Hand-entered|Simulated|Cached copy/);
  });

  it("labels a hand-entered opportunity Hand-entered, not Simulated (D20)", () => {
    const email = digest([
      matchCard({ opportunity: { ...matchCard().opportunity!, kind: "testbed", source: "Curated testbed list", simulated: true, sourceState: "simulated" } }),
    ])!;
    expect(email.html).toContain('class="vsp-sim"');
    expect(email.text).toContain("Potential match | Testbed | Curated testbed list | Hand-entered");
    expect(email.text).toContain("- Hand-entered: typed in by the team from the source, not read automatically.");
    expect(email.text).not.toContain("Simulated");
  });

  it("labels only the team's sample (fixture) rows Simulated", () => {
    const email = digest([matchCard({ opportunity: { ...matchCard().opportunity!, simulated: true, externalId: "fixture-call-1" } })])!;
    expect(email.text).toContain("Potential match | Funding call | Vinnova | Simulated");
    expect(email.text).toContain("- Simulated: sample data written by the team. Not real.");
  });

  it("labels an opportunity from a cached source with the date of the copy", () => {
    const email = digest([
      matchCard({ opportunity: { ...matchCard().opportunity!, sourceState: "cached", cachedAt: new Date("2026-11-10T09:00:00Z") } }),
    ])!;
    expect(email.html).toContain('class="vsp-cache"');
    expect(email.html).toContain("Cached copy · 10 Nov 2026");
    expect(email.text).toContain("Potential match | Funding call | Vinnova | Cached copy · 10 Nov 2026");
    expect(email.text).toContain("- Cached copy: a recorded copy of the source, from the date shown.");
  });

  it("marks a date that has passed", () => {
    const email = digest([matchCard({ opportunity: { ...matchCard().opportunity!, deadline: new Date("2026-11-10T13:00:00Z") } })])!;
    expect(email.html).toContain("(passed)");
    expect(email.text).toContain("Deadline: 10 Nov 2026, 14:00 (passed)");
  });

  it("shows a trend card as a trend note with its area, paragraphs and every source", () => {
    const email = digest([matchCard(), trendCard()])!;
    expect(email.subject).toBe("Your week, 9 Nov 2026: 1 potential match and a trend note for EmbeddedArt");
    expect(email.html).toContain("Trend note");
    expect(email.html).toContain(">Marine<");
    expect(email.html).toContain("What changed this week");
    expect(email.html).toContain("opened this week.<br>Both close");
    expect(email.html).toContain('href="https://bluesciencepark.se/news/a"');
    expect(email.html).toContain(">energimyndigheten.se<");
    // The trend card is not called a potential match: one badge for the one match card.
    expect(email.html.match(/>Potential match<\/span>/g)).toHaveLength(1);
    expect(email.text).toContain("2. Marine: two new calls close in December\n   Trend note | Marine\n   What changed this week:");
  });

  it("escapes every text from the database", () => {
    const evil = "<script>alert(1)</script>";
    const email = digest(
      [
        matchCard({
          title: `Call ${evil}`,
          why: `Why <b>bold</b> & "quoted"`,
          nextStep: `<img src=x onerror=alert(1)>`,
          uncertainties: [`<iframe src="https://evil.example">`],
          sources: [{ url: 'https://example.org/a"><script>x</script>', title: `<i>${evil}</i>` }],
          opportunity: { ...matchCard().opportunity!, source: `<u>Vinnova</u>` },
        }),
        trendCard({ trendArea: "<svg onload=alert(1)>", why: evil }),
      ],
      `Evil <Co> "AB"`,
    )!;
    expect(email.html).not.toContain("<script");
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<iframe");
    expect(email.html).not.toContain("<svg");
    expect(email.html).not.toContain("<b>bold");
    expect(email.html).not.toContain("<u>Vinnova");
    expect(email.html).toContain("Call &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("Why &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;");
    expect(email.html).toContain("Your week: Evil &lt;Co&gt; &quot;AB&quot;");
    // A quote in a URL cannot leave the href attribute.
    expect(email.html).toContain('href="https://example.org/a&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
    // The text version is plain text: kept as written, nothing to escape.
    expect(email.text).toContain(`Call ${evil}`);
  });

  it("links only http(s) sources", () => {
    const email = digest([matchCard({ sources: [{ url: "javascript:alert(1)", title: "Bad" }, { url: "https://ok.example/x" }] })])!;
    expect(email.html).not.toContain("javascript:");
    expect(email.text).not.toContain("javascript:");
    expect(email.html).toContain('href="https://ok.example/x"');
  });

  it("writes a text version with every card, the /week link and the footer, and no HTML", () => {
    const email = digest([trendCard({ position: 3 }), matchCard({ position: 1 }), matchCard({ position: 2, title: "Second call" })])!;
    expect(email.text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(email.text).toContain("Your week: EmbeddedArt\nWeek of 9 Nov 2026");
    // Cards in position order, numbered.
    expect(email.text.indexOf("1. Maritime sensor testbed call")).toBeLessThan(email.text.indexOf("2. Second call"));
    expect(email.text.indexOf("2. Second call")).toBeLessThan(email.text.indexOf("3. Marine: two new calls"));
    expect(email.text).toContain("   Potential match | Funding call | Vinnova");
    expect(email.text).toContain("   Why it fits:\n   You build underwater sensors and the call funds sea trials.");
    expect(email.text).toContain("   What is uncertain:\n   - The text does not say whether small companies can lead.");
    expect(email.text).toContain("   Source:\n   Maritime sensor testbed call: https://www.vinnova.se/e/maritime-2026");
    expect(email.text).toContain("https://vsp.example.org/week");
    expect(email.text).toContain("Information only.");
    expect(email.text).toContain("How the data is labelled:\n- Potential match: ");
  });

  it("stays well under Gmail's clipping size with a full week of long cards", () => {
    const long = "word ".repeat(300);
    const cards = [
      ...Array.from({ length: 6 }, (_, i) =>
        matchCard({ position: i + 1, why: long, nextStep: long, uncertainties: [long, long, long], title: `Call ${i} ${"t".repeat(150)}` }),
      ),
      trendCard({ position: 7, why: long, sources: Array.from({ length: 4 }, (_, i) => ({ url: `https://news.example/${i}`, title: `News ${i}` })) }),
    ];
    const email = digest(cards)!;
    expect(Buffer.byteLength(email.html)).toBeLessThan(100 * 1024);
  });

  it("refuses a site URL that is not http(s)", () => {
    expect(() => buildDigest({ companyName: "X", weekOf: "2026-11-09", cards: [matchCard()], siteUrl: "javascript:alert(1)", now })).toThrow();
  });
});

describe("weekPageUrl", () => {
  it("points at /week on the site, with or without a trailing slash", () => {
    expect(weekPageUrl("https://vsp.example.org")).toBe("https://vsp.example.org/week");
    expect(weekPageUrl("https://vsp.example.org/")).toBe("https://vsp.example.org/week");
    expect(weekPageUrl("http://localhost:3000")).toBe("http://localhost:3000/week");
  });
});

describe("countsText", () => {
  it("counts matches and trend notes", () => {
    expect(countsText([matchCard()])).toBe("1 potential match");
    expect(countsText([matchCard(), matchCard(), trendCard()])).toBe("2 potential matches and a trend note");
    expect(countsText([trendCard()])).toBe("a trend note");
  });
});
