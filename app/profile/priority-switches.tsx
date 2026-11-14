"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setPriority } from "./actions";

export type PrioritySwitch = { priority: string; label: string; on: boolean };

/** The member's priorities (C7), one switch each. Saved at once; private to the company. */
export function PrioritySwitches({ switches }: { switches: PrioritySwitch[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useOptimistic(switches, (current, changed: { priority: string; on: boolean }) =>
    current.map((s) => (s.priority === changed.priority ? { ...s, on: changed.on } : s)),
  );

  const toggle = (priority: string, on: boolean) =>
    startTransition(async () => {
      setShown({ priority, on });
      const result = await setPriority(priority, on);
      setError(result.error);
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Priorities">
        {shown.map((s) => (
          <Button
            key={s.priority}
            type="button"
            size="sm"
            variant={s.on ? "default" : "outline"}
            aria-pressed={s.on}
            disabled={pending}
            onClick={() => toggle(s.priority, !s.on)}
          >
            {s.on ? "On: " : "Off: "}
            {s.label}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
