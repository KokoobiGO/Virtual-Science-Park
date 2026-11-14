"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { BriefListItem, BriefView, OptionKind, ProgressStep, ScoutOption } from "@/lib/scout/types";

/** How often the page asks for a running brief's progress. */
const POLL_MS = 2_000;
const QUESTION_MAX = 500;

const KIND_LABELS: Record<OptionKind, string> = {
  funding: "Funding call",
  testbed: "Test facility",
  event: "Event",
  news: "News",
  other: "Web page",
};

const STATUS: Record<BriefView["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  running: { label: "Running", variant: "outline" },
  done: { label: "Done", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => dayFormat.format(new Date(iso));
const when = (iso: string) => timeFormat.format(new Date(iso));

async function fetchBrief(id: string): Promise<BriefView> {
  const res = await fetch(`/api/scout/${id}`, { cache: "no-store" });
  const body = (await res.json()) as BriefView & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body;
}

const listItem = (brief: BriefView): BriefListItem => ({
  id: brief.id,
  question: brief.question,
  status: brief.status,
  prerun: brief.prerun,
  createdAt: brief.createdAt,
  completedAt: brief.completedAt,
  options: brief.result?.options.length ?? 0,
});

export function ScoutClient({
  initialBriefs,
  initialBrief,
  suggestions,
  cachedMode,
}: {
  initialBriefs: BriefListItem[];
  initialBrief: BriefView | null;
  suggestions: string[];
  cachedMode: boolean;
}) {
  const [briefs, setBriefs] = useState(initialBriefs);
  const [current, setCurrent] = useState<BriefView | null>(initialBrief);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = current?.status === "running";
  const currentId = current?.id;

  /** Puts a brief in the list (new ones on top) and shows it. */
  function show(brief: BriefView) {
    setCurrent(brief);
    setBriefs((list) => (list.some((b) => b.id === brief.id) ? list.map((b) => (b.id === brief.id ? listItem(brief) : b)) : [listItem(brief), ...list]));
  }

  // While the open brief runs, ask for its progress every two seconds.
  useEffect(() => {
    if (!running || !currentId) return;
    let stopped = false;
    const timer = setInterval(() => {
      fetchBrief(currentId)
        .then((brief) => {
          if (stopped) return;
          setCurrent((open) => (open?.id === brief.id ? brief : open));
          setBriefs((list) => list.map((b) => (b.id === brief.id ? listItem(brief) : b)));
        })
        .catch(() => {
          // A missed poll is retried on the next tick.
        });
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [running, currentId]);

  async function open(id: string) {
    setError(null);
    try {
      show(await fetchBrief(id));
      window.history.replaceState(null, "", `/scout?brief=${id}`);
    } catch (e) {
      setError(`Could not open the brief: ${(e as Error).message}`);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/scout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const body = (await res.json()) as { id?: string; status?: string; error?: string };
      if (!res.ok || !body.id) {
        setError(body.error ?? `Scout answered ${res.status}.`);
        if (res.status === 409 && body.id) await open(body.id);
        return;
      }
      setQuestion("");
      await open(body.id);
    } catch (e) {
      setError(`Scout could not be asked: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSaved(opportunityId: string, saved: boolean) {
    if (!current) return;
    const id = current.id;
    const res = await fetch(`/api/scout/${id}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId, saved }) });
    if (!res.ok) {
      setError("The option could not be saved.");
      return;
    }
    setCurrent((open) =>
      open?.id === id
        ? { ...open, savedOpportunityIds: saved ? [...new Set([...open.savedOpportunityIds, opportunityId])] : open.savedOpportunityIds.filter((o) => o !== opportunityId) }
        : open,
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <form onSubmit={ask} className="flex flex-col gap-2">
          <Label htmlFor="scout-question">Your question</Label>
          <textarea
            id="scout-question"
            rows={3}
            maxLength={QUESTION_MAX}
            required
            minLength={10}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which test facilities and funding could fit an underwater sensor we want to trial next year?"
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting || running || question.trim().length < 10}>
              {submitting ? "Asking…" : running ? "Scout is working…" : "Ask Scout"}
            </Button>
            <span className="text-xs text-muted-foreground">A brief takes one to four minutes. You can leave the page and reopen it from the list.</span>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">{cachedMode ? "Pre-run questions (open at once in demo mode):" : "Asked before:"}</span>
              {suggestions.map((s) => (
                <Button key={s} type="button" variant="outline" size="xs" className="h-auto max-w-full py-1 text-left whitespace-normal" onClick={() => setQuestion(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
        </form>

        {error && <p className="text-sm break-words text-destructive">{error}</p>}

        {current ? <BriefPanel brief={current} onSave={toggleSaved} /> : <p className="text-sm text-muted-foreground">No briefs yet. Ask your first question above.</p>}
      </div>

      <aside className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Your briefs</h2>
        <p className="text-xs text-muted-foreground">Every brief is kept here for your company, so this list is your saved briefs.</p>
        {briefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {briefs.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => open(b.id)}
                  aria-current={b.id === current?.id ? "true" : undefined}
                  className="flex w-full flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:bg-muted aria-[current=true]:border-border aria-[current=true]:bg-muted"
                >
                  <span className="line-clamp-2 font-medium">{b.question}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={STATUS[b.status].variant}>{STATUS[b.status].label}</Badge>
                    {b.prerun && <Badge variant="outline">Pre-run</Badge>}
                    {b.status === "done" && <span>{b.options} options</span>}
                    <span>{when(b.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function BriefPanel({ brief, onSave }: { brief: BriefView; onSave: (opportunityId: string, saved: boolean) => void }) {
  const result = brief.result;
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{brief.question}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={STATUS[brief.status].variant}>{STATUS[brief.status].label}</Badge>
          {brief.prerun && <Badge variant="outline">Pre-run</Badge>}
          <span>Asked {when(brief.createdAt)}</span>
          {result && (
            <span>
              · {result.stats.seconds} s, {result.stats.modelCalls} model calls, {result.stats.searches} searches, {result.stats.pagesRead} pages read
            </span>
          )}
        </div>
      </header>

      {brief.status === "running" && (
        <div className="flex flex-col gap-3 rounded-lg border px-4 py-3">
          <p className="text-sm font-medium">Scout is working on it. This page updates by itself.</p>
          <ProgressList steps={brief.progress} />
        </div>
      )}

      {brief.status === "failed" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 px-4 py-3">
          <p className="text-sm text-destructive">{brief.error ?? "Scout could not finish this brief."}</p>
          {brief.progress.length > 0 && <ProgressList steps={brief.progress} />}
        </div>
      )}

      {result && (
        <>
          <p className="max-w-prose">{result.summary}</p>
          {result.notes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.notes.map((note) => (
                <li key={note} className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
                  {note}
                </li>
              ))}
            </ul>
          )}
          <ol className="flex flex-col gap-4">
            {result.options.map((option, i) => (
              <li key={option.citation.url}>
                <OptionCard index={i + 1} option={option} saved={!!option.opportunityId && brief.savedOpportunityIds.includes(option.opportunityId)} onSave={onSave} />
              </li>
            ))}
          </ol>
          <details className="rounded-lg border px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">How Scout built this brief</summary>
            <div className="pt-3">
              <ProgressList steps={brief.progress} />
            </div>
          </details>
        </>
      )}
    </article>
  );
}

function ProgressList({ steps }: { steps: ProgressStep[] }) {
  if (!steps.length) return <p className="text-sm text-muted-foreground">Waiting for the first step…</p>;
  const start = Date.parse(steps[0].at);
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {steps.map((step, i) => (
        <li key={`${step.at}-${i}`} className="flex gap-3">
          <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{Math.max(0, Math.round((Date.parse(step.at) - start) / 1000))} s</span>
          <span className={step.kind === "error" ? "break-words text-destructive" : "break-words"}>{step.text}</span>
        </li>
      ))}
    </ol>
  );
}

function OptionCard({ index, option, saved, onSave }: { index: number; option: ScoutOption; saved: boolean; onSave: (opportunityId: string, saved: boolean) => void }) {
  const { citation } = option;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {index}. {option.title}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Potential match</Badge>
          <span>{KIND_LABELS[option.kind]}</span>
          {citation.sourceName && <span>· {citation.sourceName}</span>}
          {option.deadline && <span>· {option.kind === "event" ? "Takes place" : "Closes"} {day(option.deadline)}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Why it could fit</h3>
          <p>
            <span className="font-medium">For you: </span>
            {option.whyProfile}
          </p>
          <p>
            <span className="font-medium">The source: </span>
            {option.whySource}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Requirements, as the source states them</h3>
          <ul className="list-disc pl-5">
            {option.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">How to get in touch</h3>
          <p className="break-words">{option.contactRoute}</p>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Open questions</h3>
          <ul className="list-disc pl-5">
            {option.openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-xs break-words text-muted-foreground">
          Source:{" "}
          <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
            {citation.title}
          </a>{" "}
          · retrieved {day(citation.retrievedAt)} · {citation.origin === "store" ? "from the opportunity store" : "from web search"}
          {citation.pageRead ? " · page read by Scout" : ""}
        </p>
        {option.opportunityId && (
          <Button type="button" size="sm" variant={saved ? "secondary" : "outline"} onClick={() => onSave(option.opportunityId!, !saved)}>
            {saved ? "Saved" : "Save"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
