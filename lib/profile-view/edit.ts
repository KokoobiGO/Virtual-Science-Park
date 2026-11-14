/**
 * The profile editor (C7): what a member's edit, a reviewed suggestion and a
 * priority switch turn into. Pure functions; app/profile/actions.ts writes
 * the result with the member's own database client, so row-level security
 * decides what may be written.
 *
 * - An edit becomes a new active claim written by the user: `user_corrected`
 *   when the value changed, `user_confirmed` when the member kept the value
 *   (and only changed who may see it, or confirmed an inferred one). Every
 *   other active claim of the field stops being active (`superseded`).
 * - Accepting a suggestion makes it active and supersedes the active claims
 *   of its field; rejecting it marks it `rejected`. Nothing is deleted.
 */
import en from "@/messages/en.json";
import { ListClaim, ProfileField, TextClaim, USER_STATUSES, UserPriority, type ClaimStatus, type Visibility } from "../schemas";
import type { ClaimRow } from "./claims";

export const MAX_SUMMARY_CHARS = 600;
export const MAX_ITEMS = 12;
export const MAX_ITEM_CHARS = 160;

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** A value as the editor shows it: the sentence, or one item per line. */
export function valueToInput(value: string | string[] | null): string {
  if (value === null) return "";
  return typeof value === "string" ? value : value.join("\n");
}

/** Why an input was refused: the key of its text under `profile.actions` in messages/*.json (C19). */
export type InputProblem = "summaryEmpty" | "summaryTooLong" | "itemsEmpty" | "tooManyItems" | "itemTooLong";

/** `max` is the limit the text names ("under {max} characters"). */
export type ParsedValue = { ok: true; value: string | string[] } | { ok: false; problem: InputProblem; max?: number };

/** What the member typed, as a value for this field: a sentence for the summary, one item per line otherwise. */
export function parseValueInput(field: ProfileField, raw: string): ParsedValue {
  if (field === "summary") {
    const value = collapse(raw);
    if (!value) return { ok: false, problem: "summaryEmpty" };
    if (value.length > MAX_SUMMARY_CHARS) return { ok: false, problem: "summaryTooLong", max: MAX_SUMMARY_CHARS };
    return { ok: true, value };
  }

  const items: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const item = collapse(line);
    if (item && !items.some((i) => i.toLowerCase() === item.toLowerCase())) items.push(item);
  }
  if (!items.length) return { ok: false, problem: "itemsEmpty" };
  if (items.length > MAX_ITEMS) return { ok: false, problem: "tooManyItems", max: MAX_ITEMS };
  if (items.some((i) => i.length > MAX_ITEM_CHARS)) return { ok: false, problem: "itemTooLong", max: MAX_ITEM_CHARS };
  return { ok: true, value: items };
}

/** Same words in the same order, ignoring spacing. */
export function sameValue(a: string | string[] | null, b: string | string[] | null): boolean {
  if (a === null || b === null) return a === b;
  const list = (v: string | string[]) => (typeof v === "string" ? [v] : v).map(collapse);
  const [x, y] = [list(a), list(b)];
  return typeof a === typeof b && x.length === y.length && x.every((item, i) => item === y[i]);
}

/**
 * Who sees a value the member writes. A correction keeps the visibility of
 * the claim it replaces; a field the member fills in themselves starts
 * private (the plan's rule for user-added fields).
 */
export function defaultVisibility(current: Pick<ClaimRow, "status" | "visibility"> | null): Visibility {
  return !current || current.status === "missing" ? "private" : current.visibility;
}

/** The claim row an edit inserts. `companyId` comes from the session, not from the form. */
export type NewUserClaim = {
  field: ProfileField;
  value: string | string[];
  status: Extract<ClaimStatus, "user_corrected" | "user_confirmed">;
  confidence: 1;
  updatedBy: "user";
  visibility: Visibility;
  reviewState: "active";
  supersedesId: string | null;
};

export type EditPlan =
  | { kind: "unchanged" }
  | { kind: "save"; claim: NewUserClaim; supersede: string[] };

/**
 * What saving `value` for `field` does, given the field's active claims now.
 * `current` is the claim in charge (the one the member saw and edited).
 */
export function planEdit(
  field: ProfileField,
  current: Pick<ClaimRow, "id" | "value" | "status" | "visibility"> | null,
  activeIds: readonly string[],
  input: { value: string | string[]; visibility: Visibility },
): EditPlan {
  const keptValue = !!current && current.status !== "missing" && sameValue(current.value, input.value);
  const fromUser = !!current && (USER_STATUSES as readonly string[]).includes(current.status);
  if (keptValue && fromUser && current.visibility === input.visibility) return { kind: "unchanged" };

  const claim: NewUserClaim = {
    field,
    value: input.value,
    status: keptValue ? "user_confirmed" : "user_corrected",
    confidence: 1,
    updatedBy: "user",
    visibility: input.visibility,
    reviewState: "active",
    supersedesId: current?.id ?? null,
  };
  // The shared contract (lib/schemas.ts) must accept what we store.
  (field === "summary" ? TextClaim : ListClaim).parse({ ...claim, evidence: [] });
  return { kind: "save", claim, supersede: [...new Set(activeIds)] };
}

export type ReviewPlan = { activate: string | null; supersede: string[]; reject: string | null };

/** Accept: the suggestion becomes active and the field's active claims step down. Reject: it is marked rejected. */
export function planReview(
  decision: "accept" | "reject",
  suggestion: Pick<ClaimRow, "id" | "field" | "reviewState">,
  activeRows: readonly Pick<ClaimRow, "id" | "field" | "reviewState">[],
): ReviewPlan | { error: "alreadyHandled" } {
  // The key of the text under `profile.actions` (C19).
  if (suggestion.reviewState !== "suggested") return { error: "alreadyHandled" };
  if (decision === "reject") return { activate: null, supersede: [], reject: suggestion.id };
  const supersede = activeRows.filter((r) => r.field === suggestion.field && r.reviewState === "active" && r.id !== suggestion.id).map((r) => r.id);
  return { activate: suggestion.id, supersede, reject: null };
}

/** The switches' names in English; the screen shows `profile.priorities.names` in the reader's language (C19). */
export const PRIORITY_TEXT: Record<UserPriority, string> = en.profile.priorities.names;

/** The member's priorities with one switched on or off, in the fixed order. Unknown values are dropped. */
export function withPriority(current: readonly string[], priority: UserPriority, on: boolean): UserPriority[] {
  const set = new Set(current.filter((p): p is UserPriority => UserPriority.safeParse(p).success));
  if (on) set.add(priority);
  else set.delete(priority);
  return UserPriority.options.filter((p) => set.has(p));
}
