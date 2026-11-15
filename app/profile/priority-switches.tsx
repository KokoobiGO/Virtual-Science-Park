"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { announce } from "@/components/announcer";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { setPriority } from "./actions";

export type PrioritySwitch = { priority: string; label: string; on: boolean };

/**
 * The member's priorities (C7), one switch each. Saved at once; private to the
 * company. "On" and "Off" are written on each switch, so the colour is never
 * the only sign. The switches are not disabled while saving, so focus stays on
 * the one pressed; a press while saving does nothing. Words in the reader's
 * language (C19); each `label` comes translated from the server.
 */
export function PrioritySwitches({ switches }: { switches: PrioritySwitch[] }) {
  const t = useT("profile");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Counts the saves, so the visible "Saved" note pops again on each one.
  const [saves, setSaves] = useState(0);
  const [shown, setShown] = useOptimistic(switches, (current, changed: { priority: string; on: boolean }) =>
    current.map((s) => (s.priority === changed.priority ? { ...s, on: changed.on } : s)),
  );

  const toggle = (item: PrioritySwitch, on: boolean) => {
    if (pending) return;
    startTransition(async () => {
      setShown({ priority: item.priority, on });
      const result = await setPriority(item.priority, on);
      setError(result.error);
      if (!result.error) {
        announce(t(on ? "priorities.savedOn" : "priorities.savedOff", { label: item.label }));
        setSaves((n) => n + 1);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("priorities.group")}>
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
            <span aria-hidden>{`${s.on ? t("priorities.on") : t("priorities.off")} `}</span>
            {s.label}
          </Button>
        ))}
      </div>
      {/* Seen on screen; screen readers already hear the announcement above, so this is not a live region. */}
      {saves > 0 && !error && !pending ? (
        <p key={saves} className="flex animate-pop items-center gap-1.5 text-sm text-success">
          <Check aria-hidden className="size-4 shrink-0" />
          {t("priorities.savedVisible")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
