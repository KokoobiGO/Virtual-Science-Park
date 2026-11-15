"use client";

import { LoaderCircle } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatTurnReply } from "@/lib/copilot/chat";
import { isSafeUrl, type Citation } from "@/lib/copilot/sources";
import { useLocale, useT } from "@/lib/i18n/client";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator, MESSAGES } from "@/lib/i18n/translate";
import { INFORMATION_ONLY_NOTE, type ScopeLabel } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type HandoffState = "idle" | "sending" | "sent" | "error";

type Entry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; reply: ChatTurnReply; handoff: HandoffState }
  | { id: number; role: "error"; text: string };

type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

/**
 * Questions to start with. They stay in English in every interface language:
 * a click sends them to the Copilot as they are, and what the model reads stays English.
 */
const SUGGESTIONS = [
  "Which test facilities could we use for an underwater sensor?",
  "Which funding calls close in the next month?",
  "Why is the first item in our list a match?",
  "What does our company profile say we work on?",
];

/** The look of each scope chip; its words are in messages/*.json (`copilot.scope`). */
const SCOPE_VARIANT: Record<ScopeLabel, "secondary" | "outline" | "destructive"> = {
  in_scope: "secondary",
  unclear: "outline",
  out_of_scope: "destructive",
  override_attempt: "destructive",
};

/** Turns that did not answer the question: the question goes back into the box so it can be sent again. */
const FAILED_OUTCOMES: ReadonlySet<ChatTurnReply["outcome"]> = new Set(["timeout", "busy", "error"]);

/** In English; the panel shows it in the reader's language (C19). */
export const QUESTION_KEPT = MESSAGES.en.copilot.questionKept;

/** What a screen reader hears when an answer arrives: the answer without its cite numbers and the fixed note. */
export function answerAnnouncement(reply: Pick<ChatTurnReply, "label" | "text" | "citations" | "outcome">, locale: Locale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale, "copilot");
  const text = reply.text
    .replace(INFORMATION_ONLY_NOTE, "")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const n = reply.citations.length;
  const sources = n ? ` ${t("announce.sourcesListed", { count: n })}` : "";
  const kept = FAILED_OUTCOMES.has(reply.outcome) ? ` ${t("questionKept")}` : "";
  return `${t("announce.answered", { label: t(`scope.${reply.label}.label`), text })}${sources}${kept}`;
}

/** The message for a turn that failed before an answer: what happened, and that the question was kept. */
export function failureText(reason: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale, "copilot");
  return t("failure", { reason: reason.trim(), kept: t("questionKept") });
}

/**
 * The progress line in the reader's language. The server sends it in English
 * (lib/copilot); a line the catalogue does not know is shown as sent.
 */
export function statusText(status: string, locale: Locale = DEFAULT_LOCALE): string {
  const known = Object.entries(MESSAGES.en.copilot.status).find(([, english]) => english === status);
  return known ? MESSAGES[locale].copilot.status[known[0] as keyof typeof MESSAGES.en.copilot.status] : status;
}

/** Reads `event:` / `data:` blocks from a text/event-stream body. */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: unknown) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = block.match(/^event: (.*)$/m)?.[1] ?? "message";
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (data) onEvent(event, JSON.parse(data));
    }
    if (done) return;
  }
}

function CitationLink({ citation, children }: { citation: Citation | undefined; children: ReactNode }) {
  const common = useT("common");
  if (!citation || !isSafeUrl(citation.url)) return <>{children}</>;
  const external = /^https?:/i.test(citation.url);
  return (
    <a
      href={citation.url}
      className="font-medium text-primary underline-offset-2 hover:underline"
      title={citation.title}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      {external ? <span className="sr-only">{common("opensInNewTab")}</span> : null}
    </a>
  );
}

/** The answer text with each [n] as a link to its source. Long words and links wrap at any width. */
function AnswerText({ text, citations }: { text: string; citations: Citation[] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
      {parts.map((part, i) => {
        const n = part.match(/^\[(\d+)\]$/)?.[1];
        if (!n) return <Fragment key={i}>{part}</Fragment>;
        return (
          <CitationLink key={i} citation={citations.find((c) => c.n === Number(n))}>
            {part}
          </CitationLink>
        );
      })}
    </p>
  );
}

/** The sources under an answer: title, publisher, dates, the data label (D20) and any injection warning. */
export function Sources({ citations }: { citations: Citation[] }) {
  const heading = useId();
  const t = useT("copilot");
  if (!citations.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <p id={heading} className="text-xs text-muted-foreground">
        {t("sources")}
      </p>
      <ol aria-labelledby={heading} className="flex flex-col gap-1 text-xs">
        {citations.map((c) => (
          <li key={c.n} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 wrap-anywhere">
            <span className="text-muted-foreground">[{c.n}]</span>
            <CitationLink citation={c}>{c.title}</CitationLink>
            {c.publisher && <span className="text-muted-foreground">· {c.publisher}</span>}
            {c.dates.length > 0 && <span className="text-muted-foreground">· {c.dates.join(", ")}</span>}
            {c.label && <DataStatusLabel kind={c.label} date={c.cachedAt} locale={t.locale} />}
            {c.warning && (
              <span className="basis-full text-warning">{c.warning}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What an empty conversation shows: questions to start with, as quiet chips. */
export function EmptyConversation({ onAsk, busy }: { onAsk: (question: string, event: MouseEvent) => void; busy: boolean }) {
  const t = useT("copilot");
  return (
    <ul aria-label={t("empty.try")} className="flex animate-fade flex-wrap gap-2">
      {SUGGESTIONS.map((s) => (
        <li key={s} className="max-w-full">
          <Button
            variant="ghost"
            size="sm"
            className="press h-auto max-w-full rounded-full px-3 py-1.5 text-left font-normal whitespace-normal text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground"
            onClick={(event) => onAsk(s, event)}
            disabled={busy}
          >
            {s}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Three dots that pulse one after another while the Copilot works. Still for readers who ask for reduced motion. */
function ThinkingDots() {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span key={delay} className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

/**
 * The Copilot chat (C11): questions about funding, test facilities, events
 * and the member's own profile and matches, answered from the store with
 * sources. Shows a scope chip on every answer and a "send to BSP staff"
 * action. Members only: /api/chat refuses everyone else.
 *
 * Accessibility (C20): the conversation is a list in reading order; a new
 * answer or a failure is read out by a live region, and focus stays where it
 * is. The question field and the Ask button stay focusable while a turn runs
 * (busy, not disabled), and a failed turn puts the question back in the box.
 */
export function CopilotPanel({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT("copilot");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const threadId = useRef<string | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const hintId = useId();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries, status]);

  /** Read a message out. The same words twice get a trailing no-break space, so the region changes and is heard again. */
  function announce(message: string) {
    setAnnouncement((previous) => (previous === message ? `${message}\u00A0` : message));
  }

  const add = (entry: NewEntry) => {
    const id = nextId.current++;
    setEntries((list) => [...list, { ...entry, id } as Entry]);
  };

  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setStatus(MESSAGES.en.copilot.status.sending);
    announce(t("announce.asking"));
    add({ role: "user", text });

    /** The turn failed: say so, and put the question back unless something new was typed. */
    const fail = (reason: string) => {
      const shown = failureText(reason, locale);
      add({ role: "error", text: shown });
      announce(shown);
      setInput((current) => current || text);
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(threadId.current ? { threadId: threadId.current } : {}) }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        fail(body?.error ?? t("failures.status", { status: res.status }));
        return;
      }
      let answered = false;
      await readEvents(res.body, (event, data) => {
        if (event === "status") setStatus((data as { text: string }).text);
        if (event === "final") {
          const reply = data as ChatTurnReply;
          threadId.current = reply.threadId;
          answered = true;
          add({ role: "assistant", reply, handoff: reply.handoffSent ? "sent" : "idle" });
          announce(answerAnnouncement(reply, locale));
          if (FAILED_OUTCOMES.has(reply.outcome)) setInput((current) => current || text);
        }
        if (event === "error") {
          answered = true;
          fail((data as { message: string }).message);
        }
      });
      if (!answered) fail(t("failures.cutOff"));
    } catch {
      fail(t("failures.unreachable"));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  /** A suggestion button disappears once asked, so focus moves to the question field (not on touch: no keyboard pop-up). */
  function askSuggestion(question: string, event: MouseEvent) {
    if ((event.nativeEvent as PointerEvent).pointerType !== "touch") inputRef.current?.focus();
    void ask(question);
  }

  async function sendToStaff(id: number, reply: ChatTurnReply) {
    if (!reply.chatId) return;
    const set = (handoff: HandoffState) => setEntries((list) => list.map((e) => (e.id === id && e.role === "assistant" ? { ...e, handoff } : e)));
    set("sending");
    try {
      const res = await fetch("/api/chat/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: reply.threadId, chatId: reply.chatId }),
      });
      set(res.ok ? "sent" : "error");
      announce(res.ok ? t("announce.sent") : t("announce.notSent"));
    } catch {
      set("error");
      announce(t("announce.notSent"));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function reset() {
    threadId.current = null;
    setEntries([]);
    // The button goes away with the conversation, so focus moves to the question field.
    inputRef.current?.focus();
    announce(t("announce.newConversation"));
  }

  const canSend = !busy && input.trim().length > 0;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col gap-4", className)} aria-label="Copilot">
      {entries.length > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
            {t("newConversation")}
          </Button>
        </div>
      )}

      <div className="flex min-h-40 min-w-0 flex-1 flex-col gap-5 overflow-y-auto">
        {entries.length === 0 && (
          <div className="mt-auto">
            <EmptyConversation onAsk={askSuggestion} busy={busy} />
          </div>
        )}

        {entries.length > 0 && (
          <ol aria-label={t("conversation")} className="flex min-w-0 flex-col gap-5">
            {entries.map((entry) => {
              if (entry.role === "user") {
                return (
                  <li
                    key={entry.id}
                    className="max-w-[85%] animate-rise self-end rounded-2xl bg-secondary px-3.5 py-2 text-sm wrap-anywhere whitespace-pre-wrap text-secondary-foreground"
                  >
                    <span className="sr-only">{`${t("youAsked")} `}</span>
                    {entry.text}
                  </li>
                );
              }
              if (entry.role === "error") {
                return (
                  <li key={entry.id} className="animate-rise">
                    <p className="text-sm text-destructive">{entry.text}</p>
                  </li>
                );
              }
              const { reply } = entry;
              return (
                <li key={entry.id} className="flex max-w-[95%] min-w-0 animate-rise flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sr-only">{t("answered")}</span>
                    <Badge variant={SCOPE_VARIANT[reply.label]} className="h-auto px-1.5 py-0 text-[0.7rem]" title={t(`scope.${reply.label}.title`)} data-testid="scope-chip">
                      {t(`scope.${reply.label}.label`)}
                    </Badge>
                  </div>
                  <AnswerText text={reply.text} citations={reply.citations} />
                  <Sources citations={reply.citations} />
                  {FAILED_OUTCOMES.has(reply.outcome) && <p className="text-xs text-muted-foreground">{t("questionKept")}</p>}
                  {reply.chatId && (
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.handoff === "sent" ? (
                        <span className="text-xs font-medium text-muted-foreground">{t("handoff.sent")}</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void sendToStaff(entry.id, reply)}
                          disabled={entry.handoff === "sending"}
                          focusableWhenDisabled
                          className="data-disabled:opacity-50"
                        >
                          {entry.handoff === "sending" ? t("handoff.sending") : t("handoff.send")}
                        </Button>
                      )}
                      {entry.handoff === "error" && <span className="text-xs text-destructive">{t("handoff.notSent")}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {status && (
          <p id={statusId} className="flex animate-fade items-center gap-2 text-sm text-muted-foreground">
            <ThinkingDots />
            {statusText(status, locale)}…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Read out by screen readers: the new answer, a failure, a handoff. Always in the page, so each change is heard. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            aria-label={t("question.label")}
            placeholder={t("question.placeholder")}
            value={input}
            maxLength={2000}
            onChange={(event) => setInput(event.target.value)}
            // Read-only rather than disabled while a turn runs, so focus stays in the field.
            readOnly={busy}
            aria-describedby={status ? `${hintId} ${statusId}` : hintId}
            className="h-10 rounded-full px-4"
          />
          <Button type="submit" disabled={!canSend} focusableWhenDisabled aria-busy={busy || undefined} className="press h-10 px-5 data-disabled:opacity-50">
            {busy ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
            {t("ask")}
          </Button>
        </div>
        <p id={hintId} className="px-1 text-xs text-muted-foreground">
          {t("hint")}
        </p>
      </form>
    </section>
  );
}
