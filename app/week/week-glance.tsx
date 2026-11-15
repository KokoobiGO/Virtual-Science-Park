import { cn } from "cn";
import { Clock } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { dateUrgency, formatWhen, urgencyText } from "@/lib/week/format";
import type { WeekCardView } from "@/lib/week/load";
import { KindIcon, type CardKind } from "./kind-icon";

/** The anchor of a card on the page, for the "next deadline" link. */
export function cardAnchor(key: string): string {
  return `card-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

/** The order the kinds are counted in. */
const KINDS: CardKind[] = ["funding", "testbed", "event", "news", "trend"];

/** The soonest date not yet passed on the week's cards: a deadline or an event day. */
function nextDate(cards: WeekCardView[], now: Date) {
  let best: { card: WeekCardView; at: Date; kind: "deadline" | "event" } | null = null;
  for (const card of cards) {
    const o = card.opportunity;
    if (!o) continue;
    for (const [kind, at] of [
      ["deadline", o.deadline],
      ["event", o.eventDate],
    ] as const) {
      // dateUrgency, not a plain comparison: a whole-day date (midnight) still counts on its own day.
      if (at && dateUrgency(at, now).level !== "passed" && (!best || at.getTime() < best.at.getTime())) best = { card, at, kind };
    }
  }
  return best;
}

/**
 * Two tiles above the cards: what comes up first, and what kinds of item the
 * week holds. A reader sees what is urgent before reading any card.
 */
export function WeekGlance({ cards, now, locale }: { cards: WeekCardView[]; now: Date; locale: Locale }) {
  const t = createTranslator(locale, "week");
  const next = nextDate(cards, now);
  const counts = new Map<CardKind, number>();
  for (const card of cards) {
    const kind: CardKind = card.kind === "trend" ? "trend" : (card.opportunity?.kind ?? "news");
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const urgency = next ? dateUrgency(next.at, now) : null;
  const soon = urgency && (urgency.level === "today" || urgency.level === "tomorrow" || urgency.level === "soon");

  return (
    <section aria-label={t("glance.title")} className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div data-glow className="flex min-w-0 flex-col gap-2 rounded-2xl p-4 ring-1 ring-foreground/10">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock aria-hidden className="size-3.5" />
          {t(next?.kind === "event" ? "glance.nextEvent" : "glance.nextDeadline")}
        </p>
        {next && urgency ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={cn("text-xl font-semibold tracking-tight", soon && (next.kind === "deadline" ? "text-warning" : "text-info"))}>
                {urgencyText(next.kind, urgency, locale)}
              </span>
              <span className="text-sm text-muted-foreground">{formatWhen(next.at, locale)}</span>
            </p>
            <a
              href={`#${cardAnchor(next.card.key)}`}
              className="truncate text-sm text-foreground/90 underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
            >
              {next.card.title}
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("glance.noDates")}</p>
        )}
      </div>

      <div data-glow className="flex min-w-0 flex-col gap-2 rounded-2xl p-4 ring-1 ring-foreground/10">
        <p className="text-xs font-medium text-muted-foreground">{t("glance.inThisWeek")}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {KINDS.filter((kind) => counts.has(kind)).map((kind) => (
            <li key={kind} className="flex items-center gap-2 text-sm">
              <KindIcon kind={kind} size="sm" />
              {t(`glance.counts.${kind}`, { count: counts.get(kind)! })}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
