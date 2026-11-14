import { DataStatusLabel } from "@/components/data-status-label";
import { formatDate, QUOTE_LANG_TEXT } from "@/lib/profile-view/claims";
import type { EvidenceView } from "@/lib/profile-view/load";

/**
 * The evidence behind a claim (C6), behind a click: each quote word for word
 * in the page's own language, highlighted inside a little of the page text
 * when the stored page text holds it, with its source link and retrieval date.
 * A quote from page text the team wrote carries the Simulated label (D20).
 * A native <details>, so closing it leaves focus on its summary.
 */
export function EvidenceViewer({ quotes }: { quotes: EvidenceView[] }) {
  if (!quotes.length) return null;
  const simulated = quotes.filter((q) => q.simulated).length;
  return (
    <details className="group rounded-lg border bg-muted/30 text-sm">
      <summary className="cursor-pointer rounded-lg px-3 py-2 font-medium select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Evidence: {quotes.length === 1 ? "1 quote" : `${quotes.length} quotes`}
        {simulated ? <span className="font-normal text-muted-foreground"> ({simulated === quotes.length ? "simulated" : `${simulated} simulated`})</span> : null}
      </summary>
      <ol className="flex flex-col gap-3 px-3 pt-1 pb-3">
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
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {q.simulated ? <DataStatusLabel kind="simulated" /> : null}
                <span>{QUOTE_LANG_TEXT[q.quoteLang]}</span>
                <span aria-hidden>&middot;</span>
                {q.simulated ? (
                  <span>Page text written by the team, not read from the site</span>
                ) : (
                  <span>
                    Retrieved <time dateTime={q.retrievedAt.toISOString()}>{formatDate(q.retrievedAt)}</time>
                  </span>
                )}
                {q.context ? null : <span>(shown without the page text around it)</span>}
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
