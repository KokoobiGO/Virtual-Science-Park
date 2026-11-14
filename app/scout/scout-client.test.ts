import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { prerunBriefs } from "@/lib/scout/prerun";
import type { BriefView, ScoutOption } from "@/lib/scout/types";
import { ScoutClient } from "./scout-client";

/** The page's first render, as the server sends it, from a real pre-run brief. */
function render(brief: BriefView | null, cachedMode = false) {
  const briefs = brief
    ? [
        {
          id: brief.id,
          question: brief.question,
          status: brief.status,
          prerun: brief.prerun,
          createdAt: brief.createdAt,
          completedAt: brief.completedAt,
          options: brief.result?.options.length ?? 0,
          recordedAt: brief.result?.createdAt ?? null,
        },
      ]
    : [];
  const html = renderToString(createElement(ScoutClient, { initialBriefs: briefs, initialBrief: brief, suggestions: brief ? [brief.question] : [], cachedMode }));
  // React separates adjacent text parts with empty comments; the reader sees one sentence.
  return html.replaceAll("<!-- -->", "");
}

/** The part of the page for one option card, by its citation URL. */
function card(html: string, option: ScoutOption): string {
  const at = html.indexOf(`href="${option.citation.url.replace(/&/g, "&amp;")}"`);
  return html.slice(html.lastIndexOf('data-slot="card"', at), html.indexOf("</li>", at));
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
    // A pre-run copy is a new row: its own dates are the day it was copied, not the day of the recording.
    createdAt: "2026-12-01T09:00:00.000Z",
    completedAt: "2026-12-01T09:00:00.000Z",
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

  it("labels a stored demo brief as a cached copy dated by its recording, in the panel and the list", () => {
    const html = render(done, true);
    // The recording was made on 14 Nov 2026 (the result's createdAt), not on the day it was copied.
    expect(html.match(/data-data-status="cached"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Cached copy · 14 Nov 2026/g)).toHaveLength(2);
    expect(html).toContain("A recorded copy of an earlier Scout run from 14 November 2026");
    expect(html).not.toContain(">Pre-run<");
  });

  it("has one h2 for the open brief, an h3 per option and a live region", () => {
    const html = render(done, true);
    const article = html.slice(html.indexOf("<article"), html.indexOf("</article>"));
    expect(article.match(/<h2/g)).toHaveLength(1);
    expect(article.match(/<h3/g)).toHaveLength(done.result!.options.length);
    expect(html).toContain('role="status"');
  });

  it("labels store citations that are hand-entered or from a cached copy, and says when a page read was a stored copy", () => {
    const [first, second, third, fourth] = done.result!.options;
    const labelled: BriefView = {
      ...done,
      prerun: false,
      result: {
        ...done.result!,
        options: [
          { ...first, citation: { ...first.citation, simulated: true, sourceState: "simulated" } },
          { ...second, citation: { ...second.citation, simulated: false, sourceState: "cached", sourceCachedAt: "2026-11-10T02:00:00.000Z" } },
          { ...third, citation: { ...third.citation, simulated: false, sourceState: "live", pageRead: true, pageStored: true, retrievedAt: "2026-11-12" } },
          // A brief stored before citations carried a status: no label, rather than a wrong one.
          fourth,
        ],
      },
    };
    const html = render(labelled);
    expect(card(html, labelled.result!.options[0])).toContain("Hand-entered");
    expect(card(html, labelled.result!.options[1])).toContain("Cached copy · 10 Nov 2026");
    const stored = card(html, labelled.result!.options[2]);
    expect(stored).toContain("stored copy of the page from 12 November 2026");
    expect(stored).not.toContain("data-data-status");
    expect(card(html, labelled.result!.options[3])).not.toContain("data-data-status");
  });

  it("shows the live progress of a running brief and the empty states", () => {
    const running: BriefView = { ...done, prerun: false, status: "running", result: null, progress: done.progress.slice(0, 3) };
    const html = render(running);
    expect(html).toContain("Scout is working on it");
    expect(html).toContain(done.progress[1].text.replace(/"/g, "&quot;").slice(0, 40));
    const empty = render(null);
    expect(empty).toContain("No briefs yet.");
    expect(empty).toContain("Write a question above and press Ask Scout");
    expect(empty).toContain("None yet.");
  });
});
