/**
 * Trend analyst (A27): a weekly "what changed and why it matters" note per
 * technology area, built from this week's news and new calls. One area at a
 * time: pick the inputs, write and check the note, store it. The trend-notes
 * job and scripts/trends.ts both run this.
 */
import type { OpportunityKind, OpportunityTag } from "../schemas";
import { inputsForArea, MIN_INPUTS } from "./inputs";
import { inputId } from "./prompt";
import { noteSources, storeNote, type NoteSource } from "./store";
import { weekOf as weekOfDate } from "./week";
import { writeNote, type TrendUsage } from "./write";

export { emptyTrendUsage, type TrendUsage } from "./write";
export { weekOf } from "./week";

/** One input as the run log and the script show it. */
export type InputSummary = { id: string; kind: OpportunityKind; source: string; title: string; url: string };

export type TrendOutcome = { area: OpportunityTag; weekOf: string; inputs: InputSummary[] } & (
  | { status: "too_few_inputs" }
  | { status: "failed_checks"; problems: string[]; rejected: { title: string; body: string; cited: string[] } | null; attempts: number; seconds: number }
  | {
      status: "written";
      title: string;
      body: string;
      /** The short ids the note cites, e.g. ["S1", "S3"]. */
      cited: string[];
      sources: NoteSource[];
      attempts: number;
      seconds: number;
      /** Null on a dry run. */
      stored: { id: string } | null;
    }
);

export type TrendOptions = {
  /** The run's time: the week and "new this week" are counted from it. */
  now: Date;
  /** False for a dry run: the note is written and checked but not stored. */
  store: boolean;
  model?: string;
  usage?: TrendUsage;
};

export async function trendNoteForArea(area: OpportunityTag, options: TrendOptions): Promise<TrendOutcome> {
  const weekOf = weekOfDate(options.now);
  const inputs = await inputsForArea(area, options.now);
  const summary = inputs.map((input, i) => ({ id: inputId(i), kind: input.kind, source: input.source, title: input.title, url: input.url }));
  const base = { area, weekOf, inputs: summary };
  if (inputs.length < MIN_INPUTS) return { ...base, status: "too_few_inputs" };

  const written = await writeNote(area, inputs, weekOf, { model: options.model, usage: options.usage });
  if (!written.ok) {
    const { problems, rejected, attempts, seconds } = written;
    return { ...base, status: "failed_checks", problems, rejected: rejected && { title: rejected.title, body: rejected.body, cited: rejected.sources }, attempts, seconds };
  }

  const { draft } = written;
  const sources = noteSources(draft, inputs);
  const stored = options.store ? await storeNote({ area, weekOf, title: draft.title, body: draft.body, sources }) : null;
  return {
    ...base,
    status: "written",
    title: draft.title,
    body: draft.body,
    cited: summary.filter((s) => draft.sources.includes(s.id)).map((s) => s.id),
    sources,
    attempts: written.attempts,
    seconds: written.seconds,
    stored,
  };
}
