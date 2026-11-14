"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatTurnReply } from "@/lib/copilot/chat";
import { isSafeUrl, type Citation } from "@/lib/copilot/sources";
import type { ScopeLabel } from "@/lib/schemas";
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
    </a>
  );
}

/** The answer text with each [n] as a link to its source. */
function AnswerText({ text, citations }: { text: string; citations: Citation[] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
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

function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="flex flex-col gap-1 border-t pt-2">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      <ol className="flex flex-col gap-1 text-xs">
        {citations.map((c) => (
          <li key={c.n} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="text-muted-foreground">[{c.n}]</span>
            <CitationLink citation={c}>{c.title}</CitationLink>
            {c.publisher && <span className="text-muted-foreground">· {c.publisher}</span>}
            {c.dates.length > 0 && <span className="text-muted-foreground">· {c.dates.join(", ")}</span>}
            {c.simulated && (
              <Badge variant="outline" title="Entered by hand by the team, not collected from the source">
                Hand-entered
              </Badge>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The Copilot chat (C11): questions about funding, test facilities, events
 * and the member's own profile and matches, answered from the store with
 * sources. Shows a scope chip on every answer and a "send to BSP staff"
 * action. Members only: /api/chat refuses everyone else.
 */
export function CopilotPanel({ className }: { className?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const threadId = useRef<string | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries, status]);

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
    add({ role: "user", text });
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, ...(threadId.current ? { threadId: threadId.current } : {}) }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        add({ role: "error", text: body?.error ?? `The Copilot answered ${res.status}.` });
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
        }
        if (event === "error") {
          answered = true;
          add({ role: "error", text: (data as { message: string }).message });
        }
      });
      if (!answered) add({ role: "error", text: "The answer was cut off. Please try again." });
    } catch {
      add({ role: "error", text: "The Copilot could not be reached. Please try again." });
    } finally {
      setBusy(false);
      setStatus(null);
    }
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
    } catch {
      set("error");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function reset() {
    threadId.current = null;
    setEntries([]);
  }

  return (
    <section className={cn("flex min-h-0 flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10", className)} aria-label="Copilot">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
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

      <div className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto" aria-live="polite">
        {entries.length === 0 && (
          <div className="flex flex-col items-start gap-1">
            <p className="text-sm text-muted-foreground">Try:</p>
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="ghost" size="sm" className="h-auto whitespace-normal text-left" onClick={() => void ask(s)} disabled={busy}>
                {s}
              </Button>
            ))}
          </div>
        )}

        {entries.map((entry) => {
          if (entry.role === "user") {
            return (
              <div key={entry.id} className="max-w-[85%] self-end rounded-lg bg-secondary px-3 py-2 text-sm whitespace-pre-wrap text-secondary-foreground">
                {entry.text}
              </div>
            );
          }
          if (entry.role === "error") {
            return (
              <p key={entry.id} className="text-sm text-destructive">
                {entry.text}
              </p>
            );
          }
          const { reply } = entry;
          const chip = SCOPE_CHIP[reply.label];
          return (
            <div key={entry.id} className="flex max-w-[95%] flex-col gap-2 rounded-lg border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={chip.variant} title={chip.title} data-testid="scope-chip">
                  {chip.label}
                </Badge>
              </div>
              <AnswerText text={reply.text} citations={reply.citations} />
              <Sources citations={reply.citations} />
              {reply.chatId && (
                <div className="flex items-center gap-2">
                  {entry.handoff === "sent" ? (
                    <span className="text-xs font-medium text-muted-foreground">Sent to BSP staff</span>
                  ) : (
                    <Button variant="outline" size="xs" onClick={() => void sendToStaff(entry.id, reply)} disabled={entry.handoff === "sending"}>
                      {entry.handoff === "sending" ? "Sending…" : "Send to BSP staff"}
                    </Button>
                  )}
                  {entry.handoff === "error" && <span className="text-xs text-destructive">Not sent. Try again.</span>}
                </div>
              )}
            </div>
          );
        })}

        {status && <p className="text-sm text-muted-foreground">{status}…</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="Your question"
          placeholder="Ask about funding, test facilities, events or your matches"
          value={input}
          maxLength={2000}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {busy ? "Working…" : "Ask"}
        </Button>
      </form>
    </section>
  );
}
