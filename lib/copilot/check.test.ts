import { describe, expect, it } from "vitest";
import {
  asksEligibility,
  checkAnswer,
  isFactual,
  NO_SOURCED_ANSWER,
  POTENTIAL_MATCH_SENTENCE,
  soundsLikeEligibilityDecision,
  splitSentences,
  storeTerms,
} from "./check";
import { HANDOFF_SENT_TEXT } from "./handoff";
import { BSP_CONTACT, INFORMATION_ONLY_NOTE } from "./policy";
import { SourceRegistry, type SourceEntry } from "./sources";

function registry(): SourceEntry[] {
  const r = new SourceRegistry();
  r.add({
    url: "https://testandevaluation.fmv.se/about/test-ranges/fmv-naval-test-ranges/",
    title: "FMV Naval Test Ranges (Naval Test Centre, Karlskrona)",
    publisher: "Curated testbed list",
    dates: ["retrieved 2026-11-14"],
    simulated: true,
    opportunityId: "11111111-1111-4111-8111-111111111111",
  });
  r.add({
    url: "https://www.vinnova.se/e/watchdog",
    title: "The Baltic Marine Watchdog Challenge",
    publisher: "Vinnova",
    dates: ["closes 2026-12-08", "retrieved 2026-11-14"],
    opportunityId: "22222222-2222-4222-8222-222222222222",
    whoMayApply: "Teams led by a Swedish legal entity; companies of any size may take part.",
  });
  r.add({ url: "https://www.mtcos.se/saltö", title: "MTC Saltö marine technology environment, Karlskrona", publisher: "Curated testbed list", dates: ["retrieved 2026-11-14"] });
  return [...r.all()];
}

describe("checkAnswer: citations", () => {
  it("keeps cited sentences, numbers sources in order of use and appends the note", () => {
    const { text, citations, changes } = checkAnswer({
      text: "MTC Saltö in Karlskrona is a marine test environment [3]. FMV runs naval test ranges for sensor trials [1].",
      sources: registry(),
    });
    expect(text).toBe(
      `MTC Saltö in Karlskrona is a marine test environment [1]. FMV runs naval test ranges for sensor trials [2].\n\n${INFORMATION_ONLY_NOTE}`,
    );
    expect(citations.map((c) => [c.n, c.title])).toEqual([
      [1, "MTC Saltö marine technology environment, Karlskrona"],
      [2, "FMV Naval Test Ranges (Naval Test Centre, Karlskrona)"],
    ]);
    expect(citations[1]).toMatchObject({ dates: ["retrieved 2026-11-14"], simulated: true, opportunityId: "11111111-1111-4111-8111-111111111111" });
    expect(changes).toEqual([]);
  });

  it("removes a sentence with a fact but no citation", () => {
    const { text, changes } = checkAnswer({
      text: "The Watchdog Challenge closes on 2026-12-08 [2]. Vinnova has funded 40 such teams since 2019.",
      sources: registry(),
    });
    expect(text).not.toContain("40 such teams");
    expect(text).toContain("closes on 2026-12-08 [1]");
    expect(changes.some((c) => c.startsWith("Removed a sentence without a source"))).toBe(true);
  });

  it("lets a citation at the end of a list item cover the sentences before it in that item", () => {
    const { text, changes } = checkAnswer({
      text: "- FMV Naval Test Ranges in Karlskrona test submarines. Contact FMV via its form [1].\n- MTC Saltö is a marine test environment [3].",
      sources: registry(),
    });
    expect(text).toContain("- FMV Naval Test Ranges in Karlskrona test submarines [1]. Contact FMV via its form [1].");
    expect(changes.some((c) => c.startsWith("Gave a sentence the citation"))).toBe(true);
  });

  it("removes cite numbers and links that no tool returned", () => {
    const { text, citations } = checkAnswer({
      text: "FMV runs naval test ranges [1][7]. See https://evil.example.com/page for more [9].",
      sources: registry(),
    });
    expect(text).toContain("FMV runs naval test ranges [1].");
    expect(text).not.toContain("evil.example.com");
    expect(text).not.toContain("[7]");
    expect(text).not.toContain("[9]");
    expect(citations).toHaveLength(1);
  });

  it("turns '(cite [n])' into a plain cite number", () => {
    const { text } = checkAnswer({ text: "The ranges (cite [1]) test sensors. Your offerings are UV sensors (offerings field, cite [1]).", sources: registry() });
    expect(text).toMatch(/^The ranges \[1\] test sensors\. Your offerings are UV sensors \[1\]\./);
  });

  it("turns a link a tool returned into its cite number", () => {
    const { text } = checkAnswer({
      text: "Read more about FMV's ranges at https://testandevaluation.fmv.se/about/test-ranges/fmv-naval-test-ranges/.",
      sources: registry(),
    });
    expect(text).toMatch(/^Read more about FMV's ranges at \[1\]\./);
  });

  it("keeps questions and offers without citations", () => {
    const { text } = checkAnswer({
      text: "FMV runs naval test ranges [1]. Would you like me to save FMV Naval Test Ranges to your list? I can also pass your question to BSP staff.",
      sources: registry(),
    });
    expect(text).toContain("Would you like me to save FMV Naval Test Ranges to your list?");
    expect(text).toContain("I can also pass your question to BSP staff.");
  });

  it("falls back to a fixed text when nothing with a source is left", () => {
    const { text } = checkAnswer({ text: "Vinnova funds marine sensors with 5 MSEK in 2027.", sources: registry() });
    expect(text).toBe(`${NO_SOURCED_ANSWER}\n\n${INFORMATION_ONLY_NOTE}`);
  });

  it("keeps an honest 'nothing found' answer that states no facts", () => {
    const { text } = checkAnswer({ text: "The store has nothing on that. Would you like me to pass the question to BSP staff?", sources: [] });
    expect(text).toBe(`The store has nothing on that. Would you like me to pass the question to BSP staff?\n\n${INFORMATION_ONLY_NOTE}`);
  });

  it("strips markdown and keeps list items", () => {
    const { text } = checkAnswer({
      text: "Here are two options:\n* **FMV Naval Test Ranges**: naval test ranges in Karlskrona [1].\n* **MTC Saltö**: a marine test environment [3].",
      sources: registry(),
    });
    expect(text).toContain("Here are two options:\n- FMV Naval Test Ranges: naval test ranges in Karlskrona [1].\n- MTC Saltö: a marine test environment [2].");
    expect(text).not.toContain("**");
  });

  it("drops a lead-in line whose list items were all removed", () => {
    const { text } = checkAnswer({ text: "Here are the options:\n- FMV Naval Test Ranges in Karlskrona.\n- MTC Saltö.", sources: registry() });
    expect(text).toBe(`${NO_SOURCED_ANSWER}\n\n${INFORMATION_ONLY_NOTE}`);
  });
});

describe("checkAnswer: eligibility", () => {
  it("rewrites 'you are eligible' to potential match with the requirements and the staff contact", () => {
    const { text, citations, changes } = checkAnswer({
      text: "Yes, EmbeddedArt is eligible for The Baltic Marine Watchdog Challenge [2]. It closes on 2026-12-08 [2].",
      sources: registry(),
      askedEligibility: true,
      companyName: "EmbeddedArt",
    });
    expect(text).not.toMatch(/is eligible/i);
    expect(text).toContain(`${POTENTIAL_MATCH_SENTENCE} [1].`);
    expect(text).toContain('Who may apply, as the source states it for The Baltic Marine Watchdog Challenge: "Teams led by a Swedish legal entity; companies of any size may take part." [1].');
    expect(text).toContain(`BSP staff can help you check this: ${BSP_CONTACT}.`);
    expect(text.endsWith(INFORMATION_ONLY_NOTE)).toBe(true);
    expect(citations).toHaveLength(1);
    expect(changes.some((c) => c.startsWith("Rewrote an eligibility sentence"))).toBe(true);
  });

  it("'Are we eligible?' gets potential match, requirements and a staff contact even when the model said none of it", () => {
    const { text } = checkAnswer({
      text: "The Baltic Marine Watchdog Challenge funds autonomous sea surveillance and closes on 2026-12-08 [2].",
      sources: registry(),
      askedEligibility: true,
    });
    expect(text).toMatch(/potential match/i);
    expect(text).toContain("Who may apply, as the source states it");
    expect(text).toContain(BSP_CONTACT);
  });

  it("does not repeat requirements the answer already quotes", () => {
    const { text } = checkAnswer({
      text: 'Who may apply: "Teams led by a Swedish legal entity; companies of any size may take part." [2]. This is a potential match, not a decision on who may apply [2].',
      sources: registry(),
      askedEligibility: true,
    });
    expect(text.match(/Teams led by a Swedish legal entity/g)).toHaveLength(1);
    expect(text).not.toContain("no stated requirements");
    expect(text).toContain(BSP_CONTACT);
  });

  it("says when the store has no stated requirements", () => {
    const sources = registry().filter((s) => !s.whoMayApply);
    const { text } = checkAnswer({ text: "FMV runs naval test ranges [1]. You can apply any time [1].", sources });
    expect(text).toContain(POTENTIAL_MATCH_SENTENCE);
    expect(text).toContain("The store has no stated requirements for this");
    expect(text).toContain(BSP_CONTACT);
    expect(text).not.toMatch(/you can apply/i);
  });

  it("rewrites denials too: an eligibility decision either way is for people", () => {
    const { text } = checkAnswer({ text: "Unfortunately you do not qualify for this call [2].", sources: registry() });
    expect(text).not.toMatch(/qualify/i);
    expect(text).toContain(POTENTIAL_MATCH_SENTENCE);
  });

  it("does not repeat the rewritten sentence", () => {
    const { text } = checkAnswer({ text: "You are eligible [2]. You will get the funding [2].", sources: registry() });
    expect(text.split(POTENTIAL_MATCH_SENTENCE).length - 1).toBe(1);
  });
});

describe("checkAnswer: handoffs", () => {
  it("confirms a handoff with 'sent to BSP staff'", () => {
    const { text } = checkAnswer({ text: "I have passed your question on.", sources: [], handoffSent: true });
    expect(text).toContain(HANDOFF_SENT_TEXT);
    expect(text).toMatch(/sent to BSP staff/);
  });

  it("confirms a saved opportunity with its source, even when the model's sentence had none", () => {
    const { text, citations } = checkAnswer({
      text: "FMV Naval Test Ranges has been added to your list.",
      sources: registry(),
      savedOpportunityIds: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(text).toBe(`Saved to your list: FMV Naval Test Ranges (Naval Test Centre, Karlskrona) [1].\n\n${INFORMATION_ONLY_NOTE}`);
    expect(citations).toHaveLength(1);
  });

  it("does not repeat it when the answer already says so", () => {
    const { text } = checkAnswer({ text: "Your question was sent to BSP staff.", sources: [], handoffSent: true });
    expect(text.match(/sent to BSP staff/g)).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("asksEligibility", () => {
    expect(asksEligibility("Are we eligible for the Watchdog Challenge?")).toBe(true);
    expect(asksEligibility("Do we qualify?")).toBe(true);
    expect(asksEligibility("Can we apply for this call?")).toBe(true);
    expect(asksEligibility("Får vi söka den här utlysningen?")).toBe(true);
    expect(asksEligibility("Which test facilities could we use for an underwater sensor?")).toBe(false);
  });

  it("soundsLikeEligibilityDecision", () => {
    expect(soundsLikeEligibilityDecision("You are eligible.")).toBe(true);
    expect(soundsLikeEligibilityDecision("Your company meets the requirements.")).toBe(true);
    expect(soundsLikeEligibilityDecision("You will receive funding.")).toBe(true);
    expect(soundsLikeEligibilityDecision("Techinova can apply until December.", "Techinova")).toBe(true);
    expect(soundsLikeEligibilityDecision("EmbeddedArt is most likely eligible for the call.")).toBe(true);
    expect(soundsLikeEligibilityDecision("You are not eligible.")).toBe(true);
    expect(soundsLikeEligibilityDecision("Your company meets all the eligibility criteria.")).toBe(true);
    expect(soundsLikeEligibilityDecision("Your eligibility is confirmed.")).toBe(true);
    expect(soundsLikeEligibilityDecision("You do not qualify.")).toBe(true);
    expect(soundsLikeEligibilityDecision("The call funds qualification testing of sensors.")).toBe(false);
    expect(soundsLikeEligibilityDecision("The call closes on 2026-12-08.")).toBe(false);
    expect(soundsLikeEligibilityDecision("If you would like to check eligibility, I can pass the question to BSP staff.")).toBe(false);
    expect(soundsLikeEligibilityDecision("Qualified staff run the ranges.")).toBe(false);
  });

  it("isFactual", () => {
    const terms = storeTerms(registry());
    expect(isFactual("It closes on 2026-12-08.")).toBe(true);
    expect(isFactual("Funding of up to 2 MSEK is available.")).toBe(true);
    expect(isFactual("The ranges are run by FMV in Karlskrona.")).toBe(true);
    expect(isFactual("Vinnova funds the challenge.", { terms })).toBe(true);
    expect(isFactual("Would you like me to save it?")).toBe(false);
    expect(isFactual("I can pass your question to BSP staff.")).toBe(false);
    expect(isFactual("Here are some options for EmbeddedArt:", { companyName: "EmbeddedArt" })).toBe(false);
  });

  it("splitSentences keeps citation marks with the sentence before", () => {
    expect(splitSentences("It is in Karlskrona. [1] It tests sonar [2].")).toEqual(["It is in Karlskrona [1].", "It tests sonar [2]."]);
  });

  it("splitSentences never splits inside a quote", () => {
    expect(splitSentences('Who may apply: "Team med ambition. Endast juridiska personer kan ansöka." [1] Ask BSP staff.')).toEqual([
      'Who may apply: "Team med ambition. Endast juridiska personer kan ansöka" [1].',
      "Ask BSP staff.",
    ]);
  });

  it("isFactual catches lower-case sentences that report what a source says", () => {
    expect(isFactual("It funds the development of autonomous systems for sea surveillance.")).toBe(true);
    expect(isFactual("the call requires a legal entity to submit the application.")).toBe(true);
    expect(isFactual("Let me know if you want more detail.")).toBe(false);
  });
});
