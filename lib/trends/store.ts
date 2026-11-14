/**
 * Stores a trend note (A27): one row per area and week. Running the job again
 * in the same week replaces that week's note in place, so its id (which
 * week_cards points at) stays the same.
 */
import { getDb } from "../db";
import { trendNotes } from "../db/schema";
import type { OpportunityTag } from "../schemas";
import type { TrendCandidate } from "./inputs";
import { inputId } from "./prompt";
import type { TrendDraft } from "./verify";

export type NoteSource = { url: string; title: string };

/** The inputs the note cites, in input order, once per URL. */
export function noteSources(draft: TrendDraft, inputs: TrendCandidate[]): NoteSource[] {
  const cited = new Set(draft.sources);
  const sources: NoteSource[] = [];
  inputs.forEach((input, i) => {
    if (cited.has(inputId(i)) && !sources.some((s) => s.url === input.url)) sources.push({ url: input.url, title: input.title });
  });
  return sources;
}

export async function storeNote(note: { area: OpportunityTag; weekOf: string; title: string; body: string; sources: NoteSource[] }): Promise<{ id: string }> {
  const [row] = await getDb()
    .insert(trendNotes)
    .values(note)
    .onConflictDoUpdate({
      target: [trendNotes.area, trendNotes.weekOf],
      // created_at says when the stored text was written.
      set: { title: note.title, body: note.body, sources: note.sources, createdAt: new Date() },
    })
    .returning({ id: trendNotes.id });
  return row;
}
