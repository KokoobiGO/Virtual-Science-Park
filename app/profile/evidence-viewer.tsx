import { Badge } from "@/components/ui/badge";
import { formatDate, QUOTE_LANG_TEXT } from "@/lib/profile-view/claims";
import type { EvidenceView } from "@/lib/profile-view/load";

/**
 * The evidence behind a claim (C6), behind a click: each quote word for word
 * in the page's own language, highlighted inside a little of the page text
 * when the stored page text holds it, with its source link and retrieval date.
 */
export function EvidenceViewer({ quotes }: { quotes: EvidenceView[] }) {
  if (!quotes.length) return null;
  return (
    <details className="group rounded-lg border bg-muted/30 text-sm">
      <summary className="cursor-pointer rounded-lg px-3 py-2 font-medium select-none hover:bg-muted">
        Evidence: {quotes.length === 1 ? "1 quote" : `${quotes.length} quotes`}
      </summary>
      <ol className="flex flex-col gap-3 px-3 pt-1 pb-3">
        {quotes.map((q) => (
          <li key={q.id} className="flex flex-col gap-1.5 border-t pt-3 first:border-t-0 first:pt-1">
            <blockquote lang={q.quoteLang === "other" ? undefined : q.quoteLang} className="leading-relaxed">
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
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{QUOTE_LANG_TEXT[q.quoteLang]}</span>
              <span aria-hidden>&middot;</span>
              <a href={q.url} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">
                {displayUrl(q.url)}
              </a>
              <span aria-hidden>&middot;</span>
              <span>Retrieved {formatDate(q.retrievedAt)}</span>
              {q.simulated ? <Badge variant="outline">Simulated page text</Badge> : null}
              {q.context ? null : <span>(shown without the page text around it)</span>}
            </p>
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
