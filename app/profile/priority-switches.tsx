"use client";

import { useOptimistic, useState, useTransition } from "react";
import { announce } from "@/components/announcer";
import { Button } from "@/components/ui/button";
import { setPriority } from "./actions";

export type PrioritySwitch = { priority: string; label: string; on: boolean };

/**
 * The member's priorities (C7), one switch each. Saved at once; private to the
 * company. "On" and "Off" are written on each switch, so the colour is never
 * the only sign. The switches are not disabled while saving, so focus stays on
 * the one pressed; a press while saving does nothing.
 */
export function PrioritySwitches({ switches }: { switches: PrioritySwitch[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useOptimistic(switches, (current, changed: { priority: string; on: boolean }) =>
    current.map((s) => (s.priority === changed.priority ? { ...s, on: changed.on } : s)),
  );

  const toggle = (item: PrioritySwitch, on: boolean) => {
    if (pending) return;
    startTransition(async () => {
      setShown({ priority: item.priority, on });
      const result = await setPriority(item.priority, on);
      setError(result.error);
      if (!result.error) announce(`${item.label}: ${on ? "on" : "off"}. Saved.`);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Your priorities">
        {shown.map((s) => (
          <Button
            key={s.priority}
            type="button"
            size="sm"
            variant={s.on ? "default" : "outline"}
            aria-pressed={s.on}
            aria-disabled={pending || undefined}
            onClick={() => toggle(s, !s.on)}
            className="aria-disabled:opacity-60"
          >
            <span aria-hidden>{s.on ? "On: " : "Off: "}</span>
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
