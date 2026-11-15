import { cn } from "cn";
import { CalendarDays, Banknote, FlaskConical, Newspaper, TrendingUp, type LucideIcon } from "lucide-react";
import type { OpportunityKind } from "@/lib/schemas";

/** A card's kind: an opportunity kind, or a trend note. */
export type CardKind = OpportunityKind | "trend";

/**
 * One icon and one tint per kind, so a reader can scan the week by shape. The
 * kind is always written next to it too: the icon never carries it alone.
 */
const LOOK: Record<CardKind, { icon: LucideIcon; tint: string }> = {
  funding: { icon: Banknote, tint: "bg-chart-3/15 text-chart-3" },
  testbed: { icon: FlaskConical, tint: "bg-chart-2/15 text-chart-2" },
  event: { icon: CalendarDays, tint: "bg-chart-4/15 text-chart-4" },
  news: { icon: Newspaper, tint: "bg-chart-1/15 text-chart-1" },
  trend: { icon: TrendingUp, tint: "bg-chart-1/15 text-chart-1" },
};

/** The kind's icon in a soft tinted square. Decorative. */
export function KindIcon({ kind, size = "md", className }: { kind: CardKind; size?: "sm" | "md"; className?: string }) {
  const { icon: Icon, tint } = LOOK[kind];
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        size === "md" ? "size-10 rounded-xl [&>svg]:size-5" : "size-7 rounded-lg [&>svg]:size-3.5",
        tint,
        className,
      )}
    >
      <Icon />
    </span>
  );
}
