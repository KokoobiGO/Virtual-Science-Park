/**
 * Is a stored profile worth showing, or too thin (A8)? A pure rule over the
 * final claims (after the quote check and retry) and the pages that were read.
 */
import { ProfileField, type ProfileStatus } from "../schemas";
import type { DraftClaim } from "./output";

/** The fields a page can state. Interests are our reading, so they do not count. */
export const FACTUAL_FIELDS: readonly ProfileField[] = ProfileField.options.filter((field) => field !== "inferredInterests");

/** Fewer supported factual fields than this and the profile is "thin". */
export const MIN_SUPPORTED_FIELDS = 3;

export type ProfilePages = {
  fetched: { source: string }[];
  failed: { url: string; error: string }[];
};

export type ProfileAssessment = {
  status: Extract<ProfileStatus, "profiled" | "thin">;
  /** Plain English, for staff. Null when there is nothing to say. */
  note: string | null;
};

export function assessProfile(claims: DraftClaim[], pages: ProfilePages): ProfileAssessment {
  const supported = new Set(claims.filter((c) => c.status !== "missing" && FACTUAL_FIELDS.includes(c.field)).map((c) => c.field)).size;
  const thin = supported < MIN_SUPPORTED_FIELDS;
  const sentences: string[] = [];

  if (thin) {
    sentences.push(`Too little public info: only ${supported} of ${FACTUAL_FIELDS.length} profile fields could be supported with quotes.`);
  }
  if (!pages.fetched.some((page) => page.source === "company_site")) {
    const reason = pages.failed
      .map((f) => f.error.trim().replace(/\.$/, ""))
      .filter(Boolean)
      .join("; ");
    // No failed page means there was no website to try: BSP's member page lists none.
    sentences.push(
      pages.failed.length
        ? `The company's own website could not be read${reason ? ` (${reason})` : ""}, so only BSP's member page was used.`
        : "BSP's member page lists no website, so only that page was used.",
    );
  }

  return { status: thin ? "thin" : "profiled", note: sentences.length ? sentences.join(" ") : null };
}
