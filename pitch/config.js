/*
 * Fill these in before the pitch. Everything here is optional: an empty value
 * keeps the slide's default, and a result that is not measured yet shows
 * "Not measured yet" (never guess a number).
 */
window.PITCH_CONFIG = {
  // Title and last slide, e.g. "Team Kokoobi · Mohammad, Ana, Erik"
  team: "",

  // The three presenters (see SCRIPT.md). Shown on the last slide and in the
  // presenter window (P), which also warns you one slide before a handover.
  speaker1: "", // the problem, slides 1 to 4
  speaker2: "", // the solution and the live demo, slides 5 to 10
  speaker3: "", // proof, next step and questions, slides 11 to 17

  // Under the two quotes on slide 2. Leave empty for
  // "Blue Science Park, challenge briefing, 13 Nov 2026".
  quoteSource: "",

  // Slide 11. Example:
  // { value: "14 min → 3 min", text: "Task A (testbeds): median by hand against with the tool, two testers from other teams, 15 Nov." }
  timedTest: null,

  // Slide 11. Example:
  // { value: "11 of 15 relevant", text: "Top five for EmbeddedArt, Malvacom and Techinova, rated by BSP staff on 15 Nov." }
  staffRating: null,

  // Small print under the numbers on slide 10. Leave empty for the default.
  // Say here if the evals were re-run on Claude, e.g. "Runs of 15 Nov 2026 on Claude Haiku 5.5 and Sonnet 5.5."
  proofFootnote: "",

  // Slide 15, e.g. "Built by a team of four in 48 hours, with AI coding tools."
  howBuilt: "",

  // Last slide, e.g. the address of the live site.
  demoUrl: "",
};
