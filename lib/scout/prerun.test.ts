import { describe, expect, it } from "vitest";
import { findPrerun, prerunBriefs, prerunQuestions, sameQuestion } from "./prerun";
import { eligibilityPhrase } from "./verify";

describe("pre-run briefs (B15)", () => {
  it("has the two demo briefs, each checked: 5 to 10 cited options, no eligibility words", () => {
    const briefs = prerunBriefs();
    expect(briefs.map((b) => b.slug).sort()).toEqual(["embeddedart", "techinova"]);
    for (const file of briefs) {
      const result = file.brief.result!;
      expect(result.options.length).toBeGreaterThanOrEqual(5);
      expect(result.options.length).toBeLessThanOrEqual(10);
      for (const option of result.options) {
        expect(option.citation.url).toMatch(/^https?:\/\//);
        expect(option.citation.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const text = [option.title, option.whyProfile, option.whySource, ...option.requirements, option.contactRoute, ...option.openQuestions].join(" ");
        expect(eligibilityPhrase(text)).toBeNull();
      }
      expect(eligibilityPhrase(result.summary)).toBeNull();
      expect(result.stats.seconds).toBeLessThan(300);
      expect(file.brief.progress.at(-1)?.kind).toBe("done");
    }
  });

  it("finds a pre-run by company and question, ignoring case, spacing and the question mark", () => {
    expect(findPrerun("embeddedart", "which test facilities and funding could fit an underwater sensor we want to trial  next year")).not.toBeNull();
    expect(findPrerun("techinova", "Funding for safer electricity grid technology?")).not.toBeNull();
    expect(findPrerun("techinova", "Which test facilities and funding could fit an underwater sensor we want to trial next year?")).toBeNull();
    expect(prerunQuestions("malvacom")).toEqual([]);
    expect(sameQuestion("A b?", "a  B")).toBe(true);
  });
});
