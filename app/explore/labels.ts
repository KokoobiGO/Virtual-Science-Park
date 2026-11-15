/**
 * Tag names on the explorer in the reader's language (C19). The URL and the
 * stored rows keep the English values ("marine", "ai"); only what is shown
 * changes. A tag the catalogue does not know is shown as it is stored.
 */
import type { Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { OpportunityTag } from "@/lib/schemas";

/** "Marine" / "Marin", for the tag filter. */
export function tagName(tag: string, locale: Locale): string {
  const known = OpportunityTag.safeParse(tag);
  return known.success ? createTranslator(locale, "explore")(`tags.${known.data}`) : tag;
}

