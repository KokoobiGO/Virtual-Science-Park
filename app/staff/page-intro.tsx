import type { ReactNode } from "react";

/** The top of a staff screen: the title and one short line under it. */
export function StaffPageIntro({ title, intro }: { title: string; intro: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col gap-2">
      <h1 className="text-title">{title}</h1>
      <p className="max-w-prose text-muted-foreground">{intro}</p>
    </div>
  );
}
