"use client";

import { cn } from "cn";
import {
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Check,
  CircleAlert,
  ExternalLink,
  MessageCircleQuestion,
  ThumbsDown,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { askBsp, giveFeedback, saveOpportunity } from "./actions";

type Feedback = "useful" | "not_relevant" | null;

export type CardActionsProps = {
  opportunityId: string;
  title: string;
  sourceUrl: string | null;
  /** The .ics download, when the opportunity has a deadline or event date. */
  calendarHref: string | null;
  initial: { saved: boolean; feedback: Feedback; askedBsp: boolean };
};

/** Which control the member just changed, so only its icon pops (not every icon on page load). */
type Changed = "save" | "useful" | "not_relevant" | "ask";

/** An icon that pops once each time `pop` changes; still on first render. */
function StateIcon({ icon: Icon, pop }: { icon: LucideIcon; pop: number | null }) {
  return (
    <span key={pop ?? "still"} aria-hidden className={cn("inline-flex", pop !== null && "animate-pop")}>
      <Icon />
    </span>
  );
}

/** The buttons on a match card. Each result comes from the server, so what is shown is what is stored. */
export function CardActions({ opportunityId, title, sourceUrl, calendarHref, initial }: CardActionsProps) {
  const t = useT("week");
  const [saved, setSaved] = useState(initial.saved);
  const [feedback, setFeedback] = useState<Feedback>(initial.feedback);
  const [askedBsp, setAskedBsp] = useState(initial.askedBsp);
  const [status, setStatus] = useState<{ text: string; error: boolean; n: number } | null>(null);
  const [changed, setChanged] = useState<{ what: Changed; n: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const say = (text: string, error = false) => setStatus((s) => ({ text, error, n: (s?.n ?? 0) + 1 }));
  const mark = (what: Changed) => setChanged((c) => ({ what, n: (c?.n ?? 0) + 1 }));
  const popFor = (what: Changed) => (changed?.what === what ? changed.n : null);

  const toggleSaved = () =>
    startTransition(async () => {
      const result = await saveOpportunity(opportunityId, !saved);
      if (!result.ok) return say(result.error, true);
      setSaved(result.saved);
      mark("save");
      say(t(result.saved ? "actions.savedStatus" : "actions.unsavedStatus"));
    });

  const choose = (kind: "useful" | "not_relevant") =>
    startTransition(async () => {
      const result = await giveFeedback(opportunityId, feedback === kind ? null : kind);
      if (!result.ok) return say(result.error, true);
      setFeedback(result.feedback);
      mark(kind);
      const ranking = t(result.reranked ? "actions.rankingNow" : "actions.rankingTonight");
      say(
        t(
          result.feedback === "useful"
            ? "actions.markedUseful"
            : result.feedback === "not_relevant"
              ? "actions.markedNotRelevant"
              : "actions.feedbackRemoved",
          { ranking },
        ),
      );
    });

  const ask = () =>
    startTransition(async () => {
      const result = await askBsp(opportunityId);
      if (!result.ok) return say(result.error, true);
      setAskedBsp(true);
      mark("ask");
      say(t(result.created ? "actions.sentStatus" : "actions.alreadySent"));
    });

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("actions.groupLabel", { title })}
        aria-busy={pending || undefined}
      >
        {sourceUrl ? (
          <Button
            variant="default"
            size="sm"
            className="press"
            render={<a href={sourceUrl} target="_blank" rel="noopener noreferrer" />}
            nativeButton={false}
          >
            <ExternalLink aria-hidden />
            {t("actions.openSource")}
          </Button>
        ) : null}
        <Button
          variant={saved ? "secondary" : "ghost"}
          size="sm"
          className="press text-muted-foreground aria-pressed:text-foreground"
          aria-pressed={saved}
          disabled={pending}
          onClick={toggleSaved}
        >
          <StateIcon icon={saved ? BookmarkCheck : Bookmark} pop={popFor("save")} />
          {t(saved ? "actions.saved" : "actions.save")}
        </Button>
        {calendarHref ? (
          <Button variant="ghost" size="sm" className="press text-muted-foreground" render={<a href={calendarHref} download />} nativeButton={false}>
            <CalendarPlus aria-hidden />
            {t("actions.addToCalendar")}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="press text-muted-foreground" disabled={pending || askedBsp} onClick={ask}>
          <StateIcon icon={askedBsp ? Check : MessageCircleQuestion} pop={popFor("ask")} />
          {t(askedBsp ? "actions.sentToBsp" : "actions.askBsp")}
        </Button>

        {/* Feedback teaches the ranking; set apart so it does not read as one more thing to do. */}
        <div role="group" aria-label={t("actions.feedbackPrompt")} className="flex flex-wrap items-center gap-1 sm:ml-auto">
          <Button
            variant={feedback === "useful" ? "secondary" : "ghost"}
            size="xs"
            className="press text-muted-foreground aria-pressed:text-foreground"
            aria-pressed={feedback === "useful"}
            disabled={pending}
            onClick={() => choose("useful")}
          >
            <StateIcon icon={feedback === "useful" ? Check : ThumbsUp} pop={popFor("useful")} />
            {t("actions.useful")}
          </Button>
          <Button
            variant={feedback === "not_relevant" ? "secondary" : "ghost"}
            size="xs"
            className="press text-muted-foreground aria-pressed:text-foreground"
            aria-pressed={feedback === "not_relevant"}
            disabled={pending}
            onClick={() => choose("not_relevant")}
          >
            <StateIcon icon={feedback === "not_relevant" ? Check : ThumbsDown} pop={popFor("not_relevant")} />
            {t("actions.notRelevant")}
          </Button>
        </div>
      </div>
      <p aria-live="polite" className={status?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {status ? (
          <span key={status.n} className="inline-flex animate-fade items-start gap-1.5">
            {status.error ? (
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            )}
            <span>{status.text}</span>
          </span>
        ) : null}
      </p>
    </div>
  );
}
