"use client";

import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { announce, Announcer } from "@/components/announcer";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { recordedAt, type BriefListItem, type BriefView, type OptionKind, type ProgressStep, type ScoutOption } from "@/lib/scout/types";
import { askFailure, citationStatus, day, euPortalHint, linkCheckText, NETWORK_FAILURE, retrievalText, scoutTitle, when, withSiteName, type AskFailure } from "./labels";

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

async function fetchBrief(id: string): Promise<BriefView> {
  const res = await fetch(`/api/scout/${id}`, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as BriefView & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `error ${res.status}`);
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
  recordedAt: brief.result?.createdAt ?? null,
});

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

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
  /** Why the last "Ask Scout" did not start a run: shown under the question box. */
  const [askError, setAskError] = useState<AskFailure | null>(null);
  /** A brief that could not be opened, or an option that could not be saved: shown above the brief. */
  const [notice, setNotice] = useState<string | null>(null);
  const briefHeading = useRef<HTMLHeadingElement>(null);
  /** Bumped when a brief is picked from the list; the heading takes the focus after that render. */
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (focusRequest) briefHeading.current?.focus();
  }, [focusRequest]);

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

  // Screen readers hear each new progress line, and the end of the run, without the focus moving.
  const lastStep = running ? current?.progress.at(-1)?.text : undefined;
  useEffect(() => {
    if (lastStep) announce(lastStep);
  }, [lastStep]);

  const seen = useRef<{ id: string; status: BriefView["status"] } | null>(current ? { id: current.id, status: current.status } : null);
  useEffect(() => {
    if (!current) return;
    const before = seen.current;
    seen.current = { id: current.id, status: current.status };
    if (before?.id !== current.id || before.status !== "running" || current.status === "running") return;
    if (current.status === "done") announce(`The brief is ready: ${plural(current.result?.options.length ?? 0, "option")}.`);
    else announce(`Scout could not finish the brief. ${current.error ?? ""}`.trim());
  }, [current]);

  // The tab title follows the open brief (the server sets it for the first one).
  const openQuestion = current?.question;
  useEffect(() => {
    if (openQuestion) document.title = withSiteName(document.title, scoutTitle(openQuestion));
  }, [openQuestion]);

  async function open(id: string, { focus = false }: { focus?: boolean } = {}) {
    setNotice(null);
    try {
      show(await fetchBrief(id));
      window.history.replaceState(null, "", `/scout?brief=${id}`);
      // Picked from the list: take the reader to the brief (on a phone the list is below it), once it is on screen.
      if (focus) setFocusRequest((n) => n + 1);
    } catch (e) {
      setNotice(`The brief could not be opened (${(e as Error).message}). Try again, or reload the page.`);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setAskError(null);
    setNotice(null);
    try {
      let res: Response;
      try {
        res = await fetch("/api/scout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      } catch {
        setAskError(NETWORK_FAILURE);
        return;
      }
      const body = (await res.json().catch(() => null)) as { id?: string; status?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        const failure = askFailure(res.ok ? 500 : res.status, body);
        setAskError(failure);
        if (failure.runningId && failure.runningId !== currentId) await open(failure.runningId);
        return;
      }
      setQuestion("");
      announce(body.status === "done" ? "A stored brief for this question is open below." : "Scout has started. Each step is read out as it comes.");
      await open(body.id);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleSaved(opportunityId: string, saved: boolean) {
    if (!current) return;
    const id = current.id;
    setNotice(null);
    let ok = false;
    try {
      const res = await fetch(`/api/scout/${id}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId, saved }) });
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setNotice(saved ? "The option could not be saved. Try again." : "The option could not be removed from saved. Try again.");
      return;
    }
    setCurrent((open) =>
      open?.id === id
        ? { ...open, savedOpportunityIds: saved ? [...new Set([...open.savedOpportunityIds, opportunityId])] : open.savedOpportunityIds.filter((o) => o !== opportunityId) }
        : open,
    );
    announce(saved ? "Saved for your company." : "Removed from saved.");
  }

  const tooShort = question.trim().length < 10;
  // "Wait for the running brief" no longer applies once that brief has finished.
  const shownError = askError?.runningId && askError.runningId === current?.id && !running ? null : askError;
  const describedBy = ["scout-question-help", shownError ? "scout-question-error" : null].filter(Boolean).join(" ");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Announcer />
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
            aria-describedby={describedBy}
            placeholder="Which test facilities and funding could fit an underwater sensor we want to trial next year?"
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
          {shownError ? (
            <div id="scout-question-error" role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm break-words text-destructive">
              <p>
                <span className="font-medium">Not started. </span>
                {shownError.message}
              </p>
              {shownError.signIn ? (
                // A new tab, so this page and the typed question stay as they are.
                <a href="/sign-in?next=/scout" target="_blank" rel="noopener" className="w-fit font-medium underline underline-offset-2">
                  Sign in again
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting || running || tooShort}>
              {submitting ? "Asking…" : running ? "Scout is working…" : "Ask Scout"}
            </Button>
            <span id="scout-question-help" className="text-xs text-muted-foreground">
              {running
                ? "Scout answers one question at a time; you can ask again when this brief is done."
                : "At least 10 characters. A brief takes one to four minutes. You can leave the page and reopen it from Your briefs."}
            </span>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1" role="group" aria-labelledby="scout-suggestions">
              <span id="scout-suggestions" className="text-xs text-muted-foreground">
                {cachedMode ? "Pre-run questions (open at once in demo mode):" : "Asked before:"}
              </span>
              {suggestions.map((s) => (
                <Button key={s} type="button" variant="outline" size="xs" className="h-auto max-w-full py-1 text-left break-words whitespace-normal" onClick={() => setQuestion(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
        </form>

        {notice ? (
          <p role="alert" className="text-sm break-words text-destructive">
            {notice}
          </p>
        ) : null}

        {current ? (
          <BriefPanel brief={current} onSave={toggleSaved} headingRef={briefHeading} />
        ) : (
          <div className="flex flex-col gap-1 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {briefs.length === 0 ? (
              <>
                <p className="font-medium text-foreground">No briefs yet.</p>
                <p>
                  Write a question above and press Ask Scout{suggestions.length ? ", or pick one of the questions under the box" : ""}. The brief
                  appears here, and every brief is kept under Your briefs.
                </p>
              </>
            ) : (
              <p>Pick a brief from Your briefs, or ask a new question above.</p>
            )}
          </div>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-3" aria-labelledby="your-briefs-heading">
        <h2 id="your-briefs-heading" className="text-sm font-semibold">
          Your briefs
        </h2>
        <p className="text-xs text-muted-foreground">Every brief is kept here for your company, so this list is your saved briefs.</p>
        {briefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Each question you ask is kept here.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {briefs.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => open(b.id, { focus: true })}
                  aria-current={b.id === current?.id ? "true" : undefined}
                  className="flex w-full min-w-0 flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:bg-muted aria-[current=true]:border-border aria-[current=true]:bg-muted"
                >
                  <span className="line-clamp-2 font-medium break-words">{b.question}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={STATUS[b.status].variant}>{STATUS[b.status].label}</Badge>
                    {b.prerun && <DataStatusLabel kind="cached" date={recordedAt(b)} />}
                    {b.status === "done" && <span>{plural(b.options, "option")}</span>}
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

function BriefPanel({
  brief,
  onSave,
  headingRef,
}: {
  brief: BriefView;
  onSave: (opportunityId: string, saved: boolean) => void;
  headingRef: Ref<HTMLHeadingElement>;
}) {
  const result = brief.result;
  return (
    <article className="flex min-w-0 flex-col gap-5" aria-labelledby="brief-heading">
      <header className="flex flex-col gap-2">
        <h2 id="brief-heading" ref={headingRef} tabIndex={-1} className="text-heading break-words outline-none">
          {brief.question}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={STATUS[brief.status].variant}>{STATUS[brief.status].label}</Badge>
          {brief.prerun && <DataStatusLabel kind="cached" date={recordedAt(brief)} />}
          <span>Asked {when(brief.createdAt)}</span>
          {result && (
            <span>
              · {result.stats.seconds} s, {result.stats.modelCalls} model calls, {result.stats.searches} searches, {result.stats.pagesRead} pages read
            </span>
          )}
        </div>
        {brief.prerun ? (
          <p className="text-sm text-muted-foreground">
            A recorded copy of an earlier Scout run from {day(recordedAt(brief))}, shown at once instead of a new run. The sources may have
            changed since: check each source page before you act on it.
          </p>
        ) : null}
      </header>

      {brief.status === "running" && (
        <div className="flex flex-col gap-3 rounded-lg border px-4 py-3">
          <p className="text-sm font-medium">Scout is working on it. This page updates by itself, and each step is read out to screen readers.</p>
          <ProgressList steps={brief.progress} />
        </div>
      )}

      {brief.status === "failed" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 px-4 py-3">
          <p className="text-sm break-words text-destructive">
            <span className="font-medium">Failed: </span>
            {brief.error ?? "Scout could not finish this brief."} Ask again to start a new brief.
          </p>
          {brief.progress.length > 0 && <ProgressList steps={brief.progress} />}
        </div>
      )}

      {result && (
        <>
          <p className="max-w-prose break-words">{result.summary}</p>
          {result.notes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {result.notes.map((note) => (
                <li key={note} className="rounded-lg bg-info-soft px-3 py-2 text-sm break-words text-info">
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
          <span className={`min-w-0 break-words ${step.kind === "error" ? "text-destructive" : ""}`}>
            {step.kind === "error" ? <span className="font-medium">Problem: </span> : null}
            {step.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function OptionCard({ index, option, saved, onSave }: { index: number; option: ScoutOption; saved: boolean; onSave: (opportunityId: string, saved: boolean) => void }) {
  const { citation } = option;
  const status = citationStatus(citation);
  const link = linkCheckText(citation);
  const euHint = euPortalHint(citation.url);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h3 className="break-words">
            {index}. {option.title}
          </h3>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Potential match</Badge>
          <span>{KIND_LABELS[option.kind]}</span>
          {citation.sourceName && <span className="break-words">· {citation.sourceName}</span>}
          {option.deadline && <span>· {option.kind === "event" ? "Takes place" : "Closes"} {day(option.deadline)}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Why it could fit</h4>
          <p className="break-words">
            <span className="font-medium">For you: </span>
            {option.whyProfile}
          </p>
          <p className="break-words">
            <span className="font-medium">The source: </span>
            {option.whySource}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Requirements, as the source states them</h4>
          <ul className="list-disc pl-5">
            {option.requirements.map((r) => (
              <li key={r} className="break-words">
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">How to get in touch</h4>
          <p className="break-words">{option.contactRoute}</p>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Open questions</h4>
          <ul className="list-disc pl-5">
            {option.openQuestions.map((q) => (
              <li key={q} className="break-words">
                {q}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
          <p className="break-words">
            Source:{" "}
            <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
              {citation.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {status ? <DataStatusLabel kind={status.kind} date={status.date} /> : null}
            <span>{citation.origin === "store" ? "From the opportunity store" : "From web search"}</span>
            <span aria-hidden>·</span>
            <span>{retrievalText(citation)}</span>
            {link ? (
              <>
                <span aria-hidden>·</span>
                <span className={link.confirmed ? undefined : "text-warning"}>{link.text}</span>
              </>
            ) : null}
          </p>
          {euHint ? <p className="break-words">{euHint}</p> : null}
        </div>
        {option.opportunityId && (
          <Button type="button" size="sm" variant={saved ? "secondary" : "outline"} onClick={() => onSave(option.opportunityId!, !saved)}>
            {saved ? "Saved" : "Save"}
            <span className="sr-only"> {option.title}</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
