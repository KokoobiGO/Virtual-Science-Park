"use client";

import { CircleAlert, LoaderCircle, SendHorizontal, TriangleAlert } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatTurnReply } from "@/lib/copilot/chat";
import { isSafeUrl, type Citation } from "@/lib/copilot/sources";
import { INFORMATION_ONLY_NOTE, type ScopeLabel } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type HandoffState = "idle" | "sending" | "sent" | "error";

type Entry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; reply: ChatTurnReply; handoff: HandoffState }
  | { id: number; role: "error"; text: string };

type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

const SUGGESTIONS = [
  "Which test facilities could we use for an underwater sensor?",
  "Which funding calls close in the next month?",
  "Why is the first item in our list a match?",
];

const SCOPE_CHIP: Record<ScopeLabel, { label: string; variant: "secondary" | "outline" | "destructive"; title: string }> = {
  in_scope: { label: "In scope", variant: "secondary", title: "Answered from the Virtual Science Park store" },
  unclear: { label: "Unclear", variant: "outline", title: "The Copilot needs one more detail" },
  out_of_scope: { label: "Out of scope", variant: "destructive", title: "Outside what the Copilot answers" },
  override_attempt: { label: "Out of scope", variant: "destructive", title: "The message tried to change the Copilot's rules" },
};

/** Turns that did not answer the question: the question goes back into the box so it can be sent again. */
const FAILED_OUTCOMES: ReadonlySet<ChatTurnReply["outcome"]> = new Set(["timeout", "busy", "error"]);

export const QUESTION_KEPT = "Your question is still in the box below, so you can send it again.";

/** What a screen reader hears when an answer arrives: the answer without its cite numbers and the fixed note. */
export function answerAnnouncement(reply: Pick<ChatTurnReply, "label" | "text" | "citations" | "outcome">): string {
  const text = reply.text
    .replace(INFORMATION_ONLY_NOTE, "")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const n = reply.citations.length;
  const sources = n ? ` ${n === 1 ? "1 source is" : `${n} sources are`} listed under the answer.` : "";
  const kept = FAILED_OUTCOMES.has(reply.outcome) ? ` ${QUESTION_KEPT}` : "";
  return `The Copilot answered, ${SCOPE_CHIP[reply.label].label}: ${text}${sources}${kept}`;
}

/** The message for a turn that failed before an answer: what happened, and that the question was kept. */
export function failureText(reason: string): string {
  return `Your question was not answered. ${reason.trim()} ${QUESTION_KEPT}`;
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
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
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
  if (!citations.length) return null;
  return (
    <div className="flex flex-col gap-1 border-t pt-2">
      <p id={heading} className="text-xs font-medium text-muted-foreground">
        Sources
      </p>
      <ol aria-labelledby={heading} className="flex flex-col gap-1.5 text-xs">
        {citations.map((c) => (
          <li key={c.n} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 wrap-anywhere">
            <span className="text-muted-foreground">[{c.n}]</span>
            <CitationLink citation={c}>{c.title}</CitationLink>
            {c.publisher && <span className="text-muted-foreground">· {c.publisher}</span>}
            {c.dates.length > 0 && <span className="text-muted-foreground">· {c.dates.join(", ")}</span>}
            {c.label && <DataStatusLabel kind={c.label} date={c.cachedAt} />}
            {c.warning && (
              <span className="flex basis-full items-start gap-1 text-warning">
                <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                {c.warning}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What an empty conversation shows: what the Copilot answers, and three questions to start with. */
export function EmptyConversation({ onAsk, busy }: { onAsk: (question: string, event: MouseEvent) => void; busy: boolean }) {
  const tryId = useId();
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <p className="font-medium">What you can ask</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-muted-foreground">
          <li>About funding calls, test facilities, events and BSP news in the Virtual Science Park store.</li>
          <li>About your own company profile, and why an opportunity is in your matches.</li>
          <li>To save an opportunity to your list, or to send your question to BSP staff.</li>
        </ul>
        <p className="text-muted-foreground">
          Every fact comes with its source. The Copilot does not search the web, and it never decides whether you can apply:
          a match is a potential match, and BSP staff can help you check.
        </p>
      </div>
      <div className="flex flex-col items-start gap-1">
        <p id={tryId} className="text-muted-foreground">
          Try one of these:
        </p>
        <ul aria-labelledby={tryId} className="flex flex-col items-start">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <Button variant="ghost" size="sm" className="h-auto text-left whitespace-normal" onClick={(event) => onAsk(s, event)} disabled={busy}>
                {s}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
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
    setStatus("Sending");
    announce("Asking the Copilot. This can take up to 30 seconds.");
    add({ role: "user", text });

    /** The turn failed: say so, and put the question back unless something new was typed. */
    const fail = (reason: string) => {
      const shown = failureText(reason);
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
        fail(body?.error ?? `The Copilot answered with error ${res.status}.`);
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
          announce(answerAnnouncement(reply));
          if (FAILED_OUTCOMES.has(reply.outcome)) setInput((current) => current || text);
        }
        if (event === "error") {
          answered = true;
          fail((data as { message: string }).message);
        }
      });
      if (!answered) fail("The answer was cut off.");
    } catch {
      fail("The Copilot could not be reached. Check your connection.");
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
      announce(res.ok ? "Sent to BSP staff." : "Not sent to BSP staff. Try again.");
    } catch {
      set("error");
      announce("Not sent to BSP staff. Try again.");
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
    announce("New conversation. The earlier questions and answers are cleared.");
  }

  const canSend = !busy && input.trim().length > 0;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10", className)} aria-label="Copilot">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-base font-semibold">Copilot</h2>
          <p className="text-sm text-muted-foreground">
            Funding calls, test facilities, events and your own profile and matches, answered from the Virtual Science Park store
            with sources.
          </p>
        </div>
        {entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
            New conversation
          </Button>
        )}
      </div>

      <div className="flex min-h-40 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        {entries.length === 0 && <EmptyConversation onAsk={askSuggestion} busy={busy} />}

        {entries.length > 0 && (
          <ol aria-label="Conversation" className="flex min-w-0 flex-col gap-3">
            {entries.map((entry) => {
              if (entry.role === "user") {
                return (
                  <li
                    key={entry.id}
                    className="max-w-[85%] self-end rounded-lg bg-secondary px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap text-secondary-foreground"
                  >
                    <span className="sr-only">You asked: </span>
                    {entry.text}
                  </li>
                );
              }
              if (entry.role === "error") {
                return (
                  <li key={entry.id} className="flex items-start gap-1.5">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <p className="text-sm text-destructive">{entry.text}</p>
                  </li>
                );
              }
              const { reply } = entry;
              const chip = SCOPE_CHIP[reply.label];
              return (
                <li key={entry.id} className="flex max-w-[95%] min-w-0 flex-col gap-2 rounded-lg border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sr-only">The Copilot answered:</span>
                    <Badge variant={chip.variant} title={chip.title} data-testid="scope-chip">
                      {chip.label}
                    </Badge>
                  </div>
                  <AnswerText text={reply.text} citations={reply.citations} />
                  <Sources citations={reply.citations} />
                  {FAILED_OUTCOMES.has(reply.outcome) && <p className="text-xs text-muted-foreground">{QUESTION_KEPT}</p>}
                  {reply.chatId && (
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.handoff === "sent" ? (
                        <span className="text-xs font-medium text-muted-foreground">Sent to BSP staff</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void sendToStaff(entry.id, reply)}
                          disabled={entry.handoff === "sending"}
                          focusableWhenDisabled
                          className="data-disabled:opacity-50"
                        >
                          {entry.handoff === "sending" ? "Sending…" : "Send to BSP staff"}
                        </Button>
                      )}
                      {entry.handoff === "error" && <span className="text-xs text-destructive">Not sent. Try again.</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {status && (
          <p id={statusId} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            {status}…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Read out by screen readers: the new answer, a failure, a handoff. Always in the page, so each change is heard. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          ref={inputRef}
          aria-label="Your question"
          placeholder="Ask about funding, test facilities, events or your matches"
          value={input}
          maxLength={2000}
          onChange={(event) => setInput(event.target.value)}
          // Read-only rather than disabled while a turn runs, so focus stays in the field.
          readOnly={busy}
          aria-describedby={status ? statusId : undefined}
        />
        <Button type="submit" disabled={!canSend} focusableWhenDisabled aria-busy={busy || undefined} className="data-disabled:opacity-50">
          {busy ? <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" /> : <SendHorizontal aria-hidden />}
          Ask
        </Button>
      </form>
    </section>
  );
}
