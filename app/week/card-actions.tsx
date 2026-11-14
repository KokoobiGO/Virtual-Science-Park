"use client";

import { Bookmark, BookmarkCheck, CalendarPlus, Check, ExternalLink, MessageCircleQuestion, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
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

/** The buttons on a match card. Each result comes from the server, so what is shown is what is stored. */
export function CardActions({ opportunityId, title, sourceUrl, calendarHref, initial }: CardActionsProps) {
  const [saved, setSaved] = useState(initial.saved);
  const [feedback, setFeedback] = useState<Feedback>(initial.feedback);
  const [askedBsp, setAskedBsp] = useState(initial.askedBsp);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleSaved = () =>
    startTransition(async () => {
      const result = await saveOpportunity(opportunityId, !saved);
      if (!result.ok) return setStatus({ text: result.error, error: true });
      setSaved(result.saved);
      setStatus({ text: result.saved ? "Saved for your company." : "Removed from saved.", error: false });
    });

  const choose = (kind: "useful" | "not_relevant") =>
    startTransition(async () => {
      const result = await giveFeedback(opportunityId, feedback === kind ? null : kind);
      if (!result.ok) return setStatus({ text: result.error, error: true });
      setFeedback(result.feedback);
      const ranking = result.reranked ? "Your ranking is being updated." : "Your ranking updates tonight.";
      setStatus({
        text:
          result.feedback === "useful"
            ? `Thanks: marked as useful. ${ranking}`
            : result.feedback === "not_relevant"
              ? `Thanks: marked as not relevant, so it leaves your matches. ${ranking}`
              : `Feedback removed. ${ranking}`,
        error: false,
      });
    });

  const ask = () =>
    startTransition(async () => {
      const result = await askBsp(opportunityId);
      if (!result.ok) return setStatus({ text: result.error, error: true });
      setAskedBsp(true);
      setStatus({ text: result.created ? "Sent to BSP staff." : "Already sent to BSP staff.", error: false });
    });

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Actions for ${title}`}>
        <Button variant={saved ? "secondary" : "outline"} size="sm" aria-pressed={saved} disabled={pending} onClick={toggleSaved}>
          {saved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
          {saved ? "Saved" : "Save"}
        </Button>
        <Button
          variant={feedback === "useful" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={feedback === "useful"}
          disabled={pending}
          onClick={() => choose("useful")}
        >
          <ThumbsUp aria-hidden />
          Useful
        </Button>
        <Button
          variant={feedback === "not_relevant" ? "secondary" : "outline"}
          size="sm"
          aria-pressed={feedback === "not_relevant"}
          disabled={pending}
          onClick={() => choose("not_relevant")}
        >
          <ThumbsDown aria-hidden />
          Not relevant
        </Button>
        {calendarHref ? (
          <Button variant="outline" size="sm" render={<a href={calendarHref} download />} nativeButton={false}>
            <CalendarPlus aria-hidden />
            Add to calendar
          </Button>
        ) : null}
        <Button variant="outline" size="sm" disabled={pending || askedBsp} onClick={ask}>
          {askedBsp ? <Check aria-hidden /> : <MessageCircleQuestion aria-hidden />}
          {askedBsp ? "Sent to BSP staff" : "Ask BSP"}
        </Button>
        {sourceUrl ? (
          <Button variant="outline" size="sm" render={<a href={sourceUrl} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
            <ExternalLink aria-hidden />
            Open source
          </Button>
        ) : null}
      </div>
      <p aria-live="polite" className={status?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {status?.text ?? ""}
      </p>
    </div>
  );
}
