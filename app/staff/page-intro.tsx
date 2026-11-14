import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The top of a staff screen: what it is (title and intro) and what to do here
 * (one short line, marked so it is easy to find at a glance).
 */
export function StaffPageIntro({ title, intro, todo, children }: { title: string; intro: ReactNode; todo: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col gap-2">
      <h1 className="text-title">{title}</h1>
      <p className="max-w-prose text-muted-foreground">{intro}</p>
      {children}
      <p className="flex w-fit max-w-full items-start gap-2 rounded-lg border border-info/35 bg-info-soft px-3 py-2 text-sm text-info">
        <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 break-words">{todo}</span>
      </p>
    </div>
  );
}
