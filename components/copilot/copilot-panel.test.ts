import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/copilot/sources";
import { TOOL_STATUS } from "@/lib/copilot/tools";
import { LocaleProvider } from "@/lib/i18n/client";
import { INJECTION_LABEL } from "@/lib/injection/detect";
import { INFORMATION_ONLY_NOTE } from "@/lib/schemas";
import { answerAnnouncement, CopilotPanel, failureText, QUESTION_KEPT, Sources, statusText } from "./copilot-panel";

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

describe("the Copilot in Swedish (C19)", () => {
  const sv = (element: Parameters<typeof render>[0]) =>
    render(createElement(LocaleProvider, { locale: "sv" } as Parameters<typeof LocaleProvider>[0], element));

  it("writes the interface in Swedish and keeps the example questions in English, as they are sent", () => {
    const html = sv(createElement(CopilotPanel));
    expect(html).toContain("Vad ni kan fråga om");
    expect(html).toContain('aria-label="Er fråga"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>.*Fråga<\/button>/);
    expect(html).toContain("möjlig matchning");
    expect(html).toContain("Which test facilities could we use for an underwater sensor?");
    expect(html).not.toContain("What you can ask");
    expect(html).not.toMatch(/berättigad|behörig|eligib/i);
  });

  it("names the sources and the data labels in Swedish", () => {
    const out = sv(
      createElement(Sources, {
        citations: [{ n: 1, url: "https://example.com/a", title: "A call", dates: [], label: "hand_entered" }],
      }),
    );
    expect(out).toMatch(/<p id="([^"]+)"[^>]*>Källor<\/p>/);
    expect(out).toContain("Inlagt för hand");
    expect(out).toContain("(öppnas i en ny flik)");
  });

  it("reads an answer out in Swedish, the Copilot's own text as it came", () => {
    const reply = { label: "out_of_scope" as const, text: "I can only help with BSP questions.", citations: [{ n: 1 }] as Citation[], outcome: "busy" as const };
    expect(answerAnnouncement(reply, "sv")).toBe(
      "Copilot svarade, Utanför området: I can only help with BSP questions. 1 källa listas under svaret. Er fråga finns kvar i rutan nedan, så att ni kan skicka den igen.",
    );
    expect(failureText("Svaret avbröts.", "sv")).toBe("Er fråga besvarades inte. Svaret avbröts. Er fråga finns kvar i rutan nedan, så att ni kan skicka den igen.");
  });

  it("knows every progress line the server sends, and shows an unknown one as sent", () => {
    for (const line of Object.values(TOOL_STATUS)) {
      expect(statusText(line, "en"), line).toBe(line);
      expect(statusText(line, "sv"), line).not.toBe(line);
    }
    for (const line of ["Sending", "Checking the question", "Thinking about your question", "Writing the answer", "Using a tool", "Checking the answer", "Adding sources to the answer", "Saving the conversation"]) {
      expect(statusText(line, "sv"), line).not.toBe(line);
    }
    expect(statusText("Something new", "sv")).toBe("Something new");
  });
});
