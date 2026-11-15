import { ChevronRight } from "lucide-react";
import { DataStatusLabel } from "@/components/data-status-label";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { formatDate, QUOTE_LANG_KEY } from "@/lib/profile-view/claims";
import type { EvidenceView } from "@/lib/profile-view/load";

/**
 * The evidence behind a claim (C6), behind a click: each quote word for word
 * in the page's own language, highlighted inside a little of the page text
 * when the stored page text holds it, with its source link and retrieval date.
 * A quote from page text the team wrote carries the Simulated label (D20).
 * A native <details>, so closing it leaves focus on its summary.
 *
 * Only the words around the quote follow the reader's language (C19); the
 * quote and its page text are never translated.
 */
export function EvidenceViewer({ quotes, locale = DEFAULT_LOCALE }: { quotes: EvidenceView[]; locale?: Locale }) {
  if (!quotes.length) return null;
  const t = createTranslator(locale, "profile");
  const newTab = createTranslator(locale, "common")("opensInNewTab");
  const simulated = quotes.filter((q) => q.simulated).length;
  return (
    <details className="group text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-muted-foreground transition-colors select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-90" />
        {t("evidence.summary", { count: quotes.length })}
        {simulated ? (
          <span>
            {" "}
            ({simulated === quotes.length ? t("evidence.allSimulated") : t("evidence.someSimulated", { count: simulated })})
          </span>
        ) : null}
      </summary>
      {/* Hidden while closed; the animation runs each time it is shown, so opening slides the quotes in. */}
      <ol className="flex animate-slide-down flex-col gap-3 pt-2 pl-5">
        {quotes.map((q) => (
          <li key={q.id} className="flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-1">
            <blockquote lang={q.quoteLang === "other" ? undefined : q.quoteLang} className="leading-relaxed break-words">
              {q.context ? (
                <>
                  <span className="text-muted-foreground">
                    {q.context.cutBefore ? "…" : ""}
                    {q.context.before}
                  </span>
                  <mark className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground">{q.context.match}</mark>
                  <span className="text-muted-foreground">
                    {q.context.after}
                    {q.context.cutAfter ? "…" : ""}
                  </span>
                </>
              ) : (
                <mark className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground">{q.quote}</mark>
              )}
            </blockquote>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {/* The link has a line of its own, so a long address wraps instead of widening the page. */}
              <a href={q.url} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">
                {displayUrl(q.url)}
                <span className="sr-only">{newTab}</span>
              </a>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {q.simulated ? <DataStatusLabel kind="simulated" locale={locale} /> : null}
                <span>{t(`evidence.languages.${QUOTE_LANG_KEY[q.quoteLang]}`)}</span>
                <span aria-hidden>&middot;</span>
                {q.simulated ? (
                  <span>{t("evidence.teamText")}</span>
                ) : (
                  <span>
                    {t.rich("evidence.retrieved", {
                      date: <time dateTime={q.retrievedAt.toISOString()}>{formatDate(q.retrievedAt, locale)}</time>,
                    })}
                  </span>
                )}
                {q.context ? null : <span>{t("evidence.noContext")}</span>}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}
