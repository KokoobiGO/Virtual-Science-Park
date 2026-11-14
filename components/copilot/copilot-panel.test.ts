import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/copilot/sources";
import { INJECTION_LABEL } from "@/lib/injection/detect";
import { INFORMATION_ONLY_NOTE } from "@/lib/schemas";
import { answerAnnouncement, CopilotPanel, failureText, QUESTION_KEPT, Sources } from "./copilot-panel";

const render = renderToStaticMarkup;

describe("CopilotPanel (C20)", () => {
  const html = render(createElement(CopilotPanel));

  it("explains what can be asked in an empty conversation and offers questions to start with", () => {
    expect(html).toContain("What you can ask");
    expect(html).toContain("Which test facilities could we use for an underwater sensor?");
    expect(html).toContain("BSP staff can help you check");
    expect(html).not.toMatch(/eligib/i);
  });

  it("keeps a live region in the page for answers, and names the question field and the Ask button", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Your question"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>.*Ask<\/button>/);
  });

  it("never disables the Ask button natively, so focus is not lost while a turn runs", () => {
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled[=\s>]/);
  });
});

describe("Sources under an answer (D20)", () => {
  const citation = (over: Partial<Citation>): Citation => ({ n: 1, url: "https://example.com/a", title: "A call", dates: ["retrieved 14 Nov 2026"], ...over });

  it("labels hand-entered, simulated and cached sources with the shared label, the cached one with the date of its copy", () => {
    const out = render(
      createElement(Sources, {
        citations: [
          citation({ n: 1, label: "hand_entered" }),
          citation({ n: 2, url: "https://example.com/b", label: "simulated", dates: [] }),
          citation({ n: 3, url: "https://example.com/c", label: "cached", cachedAt: "2026-11-10T09:00:00.000Z" }),
          citation({ n: 4, url: "https://example.com/d" }),
        ],
      }),
    );
    expect(out).toContain('data-data-status="hand_entered"');
    expect(out).toContain("Hand-entered");
    expect(out).toContain('data-data-status="simulated"');
    expect(out).toContain('data-data-status="cached"');
    expect(out).toContain("Cached copy · 10 Nov 2026");
    expect(out.match(/data-data-status=/g)).toHaveLength(3);
  });

  it("shows the injection warning next to the source that carries it", () => {
    const out = render(createElement(Sources, { citations: [citation({ warning: INJECTION_LABEL })] }));
    expect(out).toContain(INJECTION_LABEL);
  });

  it("lists the sources as a list named by its heading, and says a link opens a new tab", () => {
    const out = render(createElement(Sources, { citations: [citation({})] }));
    expect(out).toMatch(/<p id="([^"]+)"[^>]*>Sources<\/p><ol aria-labelledby="\1"/);
    expect(out).toContain("(opens in a new tab)");
  });
});

describe("what a screen reader hears", () => {
  const reply = {
    label: "in_scope" as const,
    text: `FMV runs naval test ranges [1]. MTC Saltö tests marine technology [2].\n\n${INFORMATION_ONLY_NOTE}`,
    citations: [{ n: 1 }, { n: 2 }] as Citation[],
    outcome: "answer" as const,
  };

  it("reads a new answer without its cite numbers and the fixed note, and says where the sources are", () => {
    expect(answerAnnouncement(reply)).toBe(
      "The Copilot answered, In scope: FMV runs naval test ranges. MTC Saltö tests marine technology. 2 sources are listed under the answer.",
    );
  });

  it("says the question was kept when the turn did not answer it", () => {
    expect(answerAnnouncement({ ...reply, citations: [], outcome: "busy", text: "The Copilot is busy right now." })).toBe(
      `The Copilot answered, In scope: The Copilot is busy right now. ${QUESTION_KEPT}`,
    );
    expect(failureText(" The Copilot could not be reached. ")).toBe(`Your question was not answered. The Copilot could not be reached. ${QUESTION_KEPT}`);
  });
});
