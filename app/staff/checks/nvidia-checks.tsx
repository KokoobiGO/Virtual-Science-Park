"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CheckResult, NvidiaCheckId } from "@/lib/nvidia-checks";

type Check = { id: NvidiaCheckId; label: string };
type Outcome = CheckResult & { hint?: string | null };

const BADGE = { PASS: "default", FAIL: "destructive", NOTE: "secondary" } as const;

/** Runs every check in parallel, one request each, and shows results as they arrive. */
export function NvidiaChecks({ checks }: { checks: Check[] }) {
  const [outcomes, setOutcomes] = useState<Partial<Record<NvidiaCheckId, Outcome | "running">>>({});
  const running = Object.values(outcomes).includes("running");
  const hint = Object.values(outcomes).find((o): o is Outcome => typeof o === "object" && !!o.hint)?.hint;

  function runAll() {
    setOutcomes(Object.fromEntries(checks.map((c) => [c.id, "running"])));
    for (const check of checks) {
      const fail = (detail: string): Outcome => ({ feature: check.label, status: "FAIL", detail });
      fetch(`/api/checks/nvidia?check=${check.id}`, { cache: "no-store" })
        .then(async (res) => (res.ok ? ((await res.json()) as Outcome) : fail(`${res.status} ${await res.text()}`)))
        .catch((error: unknown) => fail(String(error)))
        .then((outcome) => setOutcomes((prev) => ({ ...prev, [check.id]: outcome })));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={runAll} disabled={running}>
          {running ? "Running…" : "Run NVIDIA checks"}
        </Button>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {checks.map((check) => {
          const outcome = outcomes[check.id];
          return (
            <li key={check.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-center gap-3">
                {outcome === "running" ? (
                  <Badge variant="outline">Running</Badge>
                ) : outcome ? (
                  <Badge variant={BADGE[outcome.status]}>{outcome.status}</Badge>
                ) : (
                  <Badge variant="outline">Not run</Badge>
                )}
                <span className="font-medium">{check.label}</span>
              </div>
              {outcome && outcome !== "running" && (
                <p className="text-sm break-words text-muted-foreground">{outcome.detail}</p>
              )}
            </li>
          );
        })}
      </ul>
      {hint && <p className="text-sm text-destructive">{hint}</p>}
    </div>
  );
}
