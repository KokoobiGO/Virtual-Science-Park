/**
 * Pre-run briefs for the demo (B15). scripts/scout.ts --prerun stores a brief
 * in the database and writes it to data/scout-briefs/<slug>.json. With
 * DEMO_MODE=cached, a member who asks the same question gets that brief at
 * once instead of a new run (app/api/scout/route.ts).
 *
 * The files are imported, not read from disk, so they are bundled with the
 * route on Netlify.
 */
import embeddedart from "../../data/scout-briefs/embeddedart.json";
import techinova from "../../data/scout-briefs/techinova.json";
import { StoredBriefJson } from "./types";

export type PrerunFile = {
  slug: string;
  companyName: string;
  question: string;
  createdAt: string;
  completedAt: string | null;
  searchCount: number;
  brief: StoredBriefJson;
};

/** One entry per file in data/scout-briefs; a new pre-run file needs its import here. */
const FILES: unknown[] = [embeddedart, techinova];

/** Questions compare without case, spacing or a final question mark. */
export const sameQuestion = (a: string, b: string) => {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[?.!\s]+$/, "").trim();
  return key(a) === key(b);
};

function parse(file: unknown): PrerunFile | null {
  if (!file || typeof file !== "object") return null;
  const raw = file as Record<string, unknown>;
  const brief = StoredBriefJson.safeParse(raw.brief);
  if (typeof raw.slug !== "string" || typeof raw.question !== "string" || !brief.success || !brief.data.result) return null;
  return {
    slug: raw.slug,
    companyName: String(raw.companyName ?? raw.slug),
    question: raw.question,
    createdAt: String(raw.createdAt ?? ""),
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    searchCount: Number(raw.searchCount ?? 0),
    brief: brief.data,
  };
}

/** Every pre-run brief that parses. */
export function prerunBriefs(): PrerunFile[] {
  return FILES.map(parse).filter((f): f is PrerunFile => f !== null);
}

/** The pre-run brief for this company and question, if there is one. */
export function findPrerun(slug: string, question: string): PrerunFile | null {
  return prerunBriefs().find((f) => f.slug === slug && sameQuestion(f.question, question)) ?? null;
}

/** The pre-run questions of one company, to offer on the page. */
export function prerunQuestions(slug: string): string[] {
  return prerunBriefs()
    .filter((f) => f.slug === slug)
    .map((f) => f.question);
}
