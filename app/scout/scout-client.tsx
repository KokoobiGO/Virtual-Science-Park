"use client";

import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { announce, Announcer } from "@/components/announcer";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { NO_WEB_NOTE, recordedAt, type BriefListItem, type BriefView, type ProgressStep, type ScoutOption } from "@/lib/scout/types";
import {
  askFailure,
  citationStatus,
  day,
  networkFailure,
  openFailure,
  optionKindName,
  originText,
  retrievalText,
  scoutTitle,
  when,
  withSiteName,
  type AskFailure,
} from "./labels";

/** How often the page asks for a running brief's progress. */
const POLL_MS = 2_000;
const QUESTION_MAX = 500;

const STATUS_VARIANT: Record<BriefView["status"], "default" | "secondary" | "destructive" | "outline"> = {
  running: "outline",
  done: "secondary",
  failed: "destructive",
};

/** A brief from the API, or an error with the HTTP status (none when the request got no answer). */
async function fetchBrief(id: string): Promise<BriefView> {
  const res = await fetch(`/api/scout/${id}`, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as BriefView & { error?: string };
  if (!res.ok) throw Object.assign(new Error(body.error ?? `error ${res.status}`), { status: res.status });
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

/**
 * Scout's screen (C10). The words are in the reader's language (C19, from
 * the page's <LocaleProvider>); questions, briefs, the job's progress lines
 * and the API's own error details are shown as stored.
 */
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
  const t = useT("scout");
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
    if (current.status === "done") announce(t("announce.ready", { count: current.result?.options.length ?? 0 }));
    else announce(`${t("announce.failed")} ${current.error ?? ""}`.trim());
  }, [current, t]);

  // The tab title follows the open brief (the server sets it for the first one).
  const openQuestion = current?.question;
  useEffect(() => {
    if (openQuestion) document.title = withSiteName(document.title, scoutTitle(openQuestion, t));
  }, [openQuestion, t]);

  async function open(id: string, { focus = false }: { focus?: boolean } = {}) {
    setNotice(null);
    try {
      show(await fetchBrief(id));
      window.history.replaceState(null, "", `/scout?brief=${id}`);
      // Picked from the list: take the reader to the brief (on a phone the list is below it), once it is on screen.
      if (focus) setFocusRequest((n) => n + 1);
    } catch (e) {
      setNotice(openFailure(e as Error & { status?: number }, t));
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
        setAskError(networkFailure(t));
        return;
      }
      const body = (await res.json().catch(() => null)) as { id?: string; status?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        const failure = askFailure(res.ok ? 500 : res.status, body, t);
        setAskError(failure);
        if (failure.runningId && failure.runningId !== currentId) await open(failure.runningId);
        return;
      }
      setQuestion("");
      announce(t(body.status === "done" ? "announce.storedOpen" : "announce.started"));
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
      setNotice(t(saved ? "notices.saveFailed" : "notices.unsaveFailed"));
      return;
    }
    setCurrent((open) =>
      open?.id === id
        ? { ...open, savedOpportunityIds: saved ? [...new Set([...open.savedOpportunityIds, opportunityId])] : open.savedOpportunityIds.filter((o) => o !== opportunityId) }
        : open,
    );
    announce(t(saved ? "announce.saved" : "announce.removed"));
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
          <Label htmlFor="scout-question">{t("form.label")}</Label>
          <textarea
            id="scout-question"
            rows={3}
            maxLength={QUESTION_MAX}
            required
            minLength={10}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-describedby={describedBy}
            placeholder={t("form.placeholder")}
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          />
          {shownError ? (
            <div id="scout-question-error" role="alert" className="flex flex-col gap-1 text-sm break-words text-destructive">
              <p>
                <span className="font-medium">{t("form.notStarted")} </span>
                {shownError.message}
              </p>
              {shownError.signIn ? (
                // A new tab, so this page and the typed question stay as they are.
                <a href="/sign-in?next=/scout" target="_blank" rel="noopener" className="w-fit font-medium underline underline-offset-2">
                  {t("form.signInAgain")}
                  <OpensInNewTab />
                </a>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="press" disabled={submitting || running || tooShort}>
              {t(submitting ? "form.submitting" : running ? "form.working" : "form.submit")}
            </Button>
            <span id="scout-question-help" className="text-xs text-muted-foreground">
              {t(running ? "form.helpRunning" : "form.help")}
            </span>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1" role="group" aria-labelledby="scout-suggestions">
              <span id="scout-suggestions" className="text-xs text-muted-foreground">
                {t(cachedMode ? "form.prerun" : "form.askedBefore")}
              </span>
              {suggestions.map((s) => (
                <Button key={s} type="button" variant="outline" size="xs" className="press h-auto max-w-full rounded-full px-2.5 py-1 text-left break-words whitespace-normal" onClick={() => setQuestion(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
        </form>

        {notice ? (
          <p role="alert" className="animate-slide-down text-sm break-words text-destructive">
            {notice}
          </p>
        ) : null}

        {current ? (
          // Keyed by brief, so a newly opened brief rises in.
          <BriefPanel key={current.id} brief={current} onSave={toggleSaved} headingRef={briefHeading} />
        ) : (
          <p className="text-sm text-muted-foreground">{t(briefs.length === 0 ? "empty.text" : "empty.pick")}</p>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-3" aria-labelledby="your-briefs-heading">
        <h2 id="your-briefs-heading" className="text-sm font-semibold">
          {t("briefs.title")}
        </h2>
        {briefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("briefs.none")}</p>
        ) : (
          <ul className="flex stagger flex-col gap-1">
            {briefs.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => open(b.id, { focus: true })}
                  aria-current={b.id === current?.id ? "true" : undefined}
                  className="flex w-full min-w-0 flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=true]:border-border aria-[current=true]:bg-muted"
                >
                  <span className="line-clamp-2 font-medium break-words">{b.question}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={STATUS_VARIANT[b.status]}>{t(`status.${b.status}`)}</Badge>
                    {b.prerun && <DataStatusLabel kind="cached" date={recordedAt(b)} locale={t.locale} />}
                    {b.status === "done" && <span>{t("options", { count: b.options })}</span>}
                    <span>{when(b.createdAt, t.locale)}</span>
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

/** " (opens in a new tab)", for screen readers. */
function OpensInNewTab() {
  const tc = useT("common");
  return <span className="sr-only">{tc("opensInNewTab")}</span>;
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
  const t = useT("scout");
  const result = brief.result;
  return (
    <article className="flex min-w-0 animate-rise flex-col gap-5" aria-labelledby="brief-heading">
      <header className="flex flex-col gap-2">
        <h2 id="brief-heading" ref={headingRef} tabIndex={-1} className="text-heading break-words outline-none">
          {brief.question}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={STATUS_VARIANT[brief.status]}>{t(`status.${brief.status}`)}</Badge>
          {brief.prerun && <DataStatusLabel kind="cached" date={recordedAt(brief)} locale={t.locale} />}
          <span>{t("brief.asked", { when: when(brief.createdAt, t.locale) })}</span>
          {result && (
            <span>
              {t("brief.stats", {
                seconds: result.stats.seconds,
                modelCalls: result.stats.modelCalls,
                searches: result.stats.searches,
                pagesRead: result.stats.pagesRead,
              })}
            </span>
          )}
        </div>
        {brief.prerun ? <p className="text-sm text-muted-foreground">{t("brief.recorded", { day: day(recordedAt(brief), t.locale) })}</p> : null}
      </header>

      {brief.status === "running" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("brief.working")}</p>
          <ProgressList steps={brief.progress} live />
        </div>
      )}

      {brief.status === "failed" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm break-words text-destructive">
            <span className="font-medium">{t("brief.failed")} </span>
            {brief.error ?? t("brief.failedDefault")} {t("brief.askAgain")}
          </p>
          {brief.progress.length > 0 && <ProgressList steps={brief.progress} />}
        </div>
      )}

      {result && (
        <>
          <div className="flex max-w-prose flex-col gap-1">
            <p className="text-xs text-muted-foreground">{t("brief.summary")}</p>
            <p className="break-words">{result.summary}</p>
          </div>
          {result.notes.length > 0 && (
            <ul className="flex flex-col gap-1">
              {result.notes.map((note) => (
                <li key={note} className="text-xs break-words text-muted-foreground">
                  {/* The job's one fixed sentence is the interface's to translate; any other note is shown as stored. */}
                  {note === NO_WEB_NOTE ? t("brief.noWebNote") : note}
                </li>
              ))}
            </ul>
          )}
          <ol className="flex stagger flex-col divide-y divide-foreground/10">
            {result.options.map((option, i) => (
              <li key={option.citation.url} className="py-6 first:pt-2">
                <OptionCard index={i + 1} option={option} saved={!!option.opportunityId && brief.savedOpportunityIds.includes(option.opportunityId)} onSave={onSave} />
              </li>
            ))}
          </ol>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t("brief.howBuilt")}</summary>
            <div className="pt-3">
              <ProgressList steps={brief.progress} />
            </div>
          </details>
        </>
      )}
    </article>
  );
}

/**
 * The job's progress lines, as a list of steps. While the run is live the last
 * step is the current one: a pulsing dot, in bold, marked aria-current. The
 * lines are stored in English; another language says so under the list.
 */
function ProgressList({ steps, live = false }: { steps: ProgressStep[]; live?: boolean }) {
  const t = useT("scout");
  if (!steps.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {live ? <PulseDot /> : null}
        {t("brief.waiting")}
      </p>
    );
  }
  const start = Date.parse(steps[0].at);
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1 text-sm">
        {steps.map((step, i) => {
          const current = live && i === steps.length - 1;
          const error = step.kind === "error";
          return (
            <li key={`${step.at}-${i}`} aria-current={current ? "step" : undefined} className={`flex animate-rise items-start gap-3 ${current ? "font-medium" : ""}`}>
              <span className="w-9 shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">{Math.max(0, Math.round((Date.parse(step.at) - start) / 1000))} s</span>
              <span aria-hidden className="flex h-5 w-2.5 shrink-0 items-center justify-center">
                {current ? <PulseDot /> : <span className={`size-1.5 rounded-full ${error ? "bg-destructive" : "bg-muted-foreground/50"}`} />}
              </span>
              <span className={`min-w-0 break-words ${error ? "text-destructive" : current ? "text-foreground" : "text-muted-foreground"}`}>
                {current ? <span className="sr-only">{t("brief.now")} </span> : null}
                {error ? <span className="font-medium">{t("brief.problem")} </span> : null}
                {step.text}
              </span>
            </li>
          );
        })}
      </ol>
      {t.locale === DEFAULT_LOCALE ? null : <p className="text-xs text-muted-foreground">{t("brief.stepsInEnglish")}</p>}
    </div>
  );
}

/** A small dot that breathes: the step Scout is on now. */
function PulseDot() {
  return (
    <span aria-hidden className="relative flex size-2.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
    </span>
  );
}

function OptionCard({ index, option, saved, onSave }: { index: number; option: ScoutOption; saved: boolean; onSave: (opportunityId: string, saved: boolean) => void }) {
  const t = useT("scout");
  const { citation } = option;
  const status = citationStatus(citation);
  return (
    // A Card for its slots, drawn without a box: the list's spacing and hairlines separate the options.
    <Card className="min-w-0 gap-4 overflow-visible rounded-none bg-transparent py-0 shadow-none ring-0 [--card-spacing:0px]">
      <CardHeader>
        <CardTitle>
          <h3 className="break-words">
            {index}. {option.title}
          </h3>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t("option.potentialMatch")}</Badge>
          <span>{optionKindName(option.kind, t)}</span>
          {citation.sourceName && <span className="break-words">· {citation.sourceName}</span>}
          {option.deadline && <span>· {t(option.kind === "event" ? "option.takesPlace" : "option.closes", { day: day(option.deadline, t.locale) })}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">{t("option.whyTitle")}</h4>
          <p className="break-words">
            <span className="font-medium">{t("option.forYou")} </span>
            {option.whyProfile}
          </p>
          <p className="break-words">
            <span className="font-medium">{t("option.theSource")} </span>
            {option.whySource}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">{t("option.requirementsTitle")}</h4>
          <ul className="list-disc pl-5">
            {option.requirements.map((r) => (
              <li key={r} className="break-words">
                {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">{t("option.contactTitle")}</h4>
          <p className="break-words">{option.contactRoute}</p>
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">{t("option.openQuestionsTitle")}</h4>
          <ul className="list-disc pl-5">
            {option.openQuestions.map((q) => (
              <li key={q} className="break-words">
                {q}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 rounded-none border-t-0 bg-transparent">
        <div className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground">
          <p className="break-words">
            {t("option.source")}{" "}
            <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
              {citation.title}
              <OpensInNewTab />
            </a>
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {status ? <DataStatusLabel kind={status.kind} date={status.date} locale={t.locale} /> : null}
            <span>{originText(citation, t)}</span>
            <span aria-hidden>·</span>
            <span>{retrievalText(citation, t)}</span>
          </p>
          {citation.injection ? (
            // The detector flagged the text (lib/injection/detect.ts); the stored label only says so, the words are the catalogue's.
            <p className="break-words text-warning" data-injection>
              {t("option.injection")}
            </p>
          ) : null}
        </div>
        {option.opportunityId && (
          <Button type="button" size="sm" variant={saved ? "secondary" : "outline"} onClick={() => onSave(option.opportunityId!, !saved)}>
            {t(saved ? "option.saved" : "option.save")}
            <span className="sr-only"> {option.title}</span>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
