import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { prerunBriefs } from "@/lib/scout/prerun";
import type { BriefView } from "@/lib/scout/types";
import { ScoutClient } from "./scout-client";

/** The page's first render, as the server sends it, from a real pre-run brief. */
function render(brief: BriefView | null, cachedMode = false) {
  const briefs = brief ? [{ id: brief.id, question: brief.question, status: brief.status, prerun: brief.prerun, createdAt: brief.createdAt, completedAt: brief.completedAt, options: brief.result?.options.length ?? 0 }] : [];
  return renderToString(createElement(ScoutClient, { initialBriefs: briefs, initialBrief: brief, suggestions: brief ? [brief.question] : [], cachedMode }));
}

describe("ScoutClient", () => {
  const file = prerunBriefs().find((f) => f.slug === "embeddedart")!;
  const done: BriefView = {
    id: "00000000-0000-4000-8000-000000000001",
    question: file.question,
    status: "done",
    progress: file.brief.progress,
    result: file.brief.result,
    error: null,
    prerun: true,
    searchCount: file.searchCount,
    createdAt: file.createdAt,
    completedAt: file.completedAt,
    savedOpportunityIds: [file.brief.result!.options[0].opportunityId!],
  };

  it("shows a finished brief: every option as a potential match with its requirements, contact and citation", () => {
    const html = render(done, true);
    const options = done.result!.options;
    expect(html.match(/Potential match/g)).toHaveLength(options.length);
    expect(html).toContain("Requirements, as the source states them");
    for (const option of options) expect(html).toContain(`href="${option.citation.url.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("Web search was not available; built from stored sources.");
    expect(html).toContain("Pre-run questions (open at once in demo mode):");
    expect(html).toContain(">Saved<");
    expect(html).not.toMatch(/eligib|qualif/i);
  });

  it("shows the live progress of a running brief and an empty state", () => {
    const running: BriefView = { ...done, status: "running", result: null, progress: done.progress.slice(0, 3) };
    const html = render(running);
    expect(html).toContain("Scout is working on it");
    expect(html).toContain(done.progress[1].text.replace(/"/g, "&quot;").slice(0, 40));
    expect(render(null)).toContain("No briefs yet");
  });
});
