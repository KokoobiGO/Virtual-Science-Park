"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { CheckResult } from "@/lib/model-checks";

type Check = { id: string; label: string };
type Outcome = CheckResult & { hint?: string | null };

const BADGE = { PASS: "default", FAIL: "destructive", NOTE: "secondary" } as const;

/**
 * Runs every check of one service in parallel, one request each to
 * `${endpoint}?check=<id>`, and shows results as they arrive. Words in the
 * reader's language (C19); check names and results as the server sends them.
 */
export function ServiceChecks({ endpoint, button, checks }: { endpoint: string; button: string; checks: Check[] }) {
  const t = useT("checks");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | "running">>({});
  const running = Object.values(outcomes).includes("running");
  const hint = Object.values(outcomes).find((o): o is Outcome => typeof o === "object" && !!o.hint)?.hint;
  const done = Object.values(outcomes).filter((o) => o !== "running").length;

  function runAll() {
    if (running) return;
    setOutcomes(Object.fromEntries(checks.map((c) => [c.id, "running"])));
    for (const check of checks) {
      const fail = (detail: string): Outcome => ({ feature: check.label, status: "FAIL", detail });
      fetch(`${endpoint}?check=${check.id}`, { cache: "no-store" })
        .then(async (res) => (res.ok ? ((await res.json()) as Outcome) : fail(`${res.status} ${await res.text()}`)))
        .catch((error: unknown) => fail(String(error)))
        .then((outcome) => setOutcomes((prev) => ({ ...prev, [check.id]: outcome })));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={runAll} aria-disabled={running || undefined} className="aria-disabled:opacity-60">
          {running ? t("service.running") : button}
        </Button>
      </div>
      {/* Always in the page, so screen readers hear the progress. */}
      <p role="status" className="sr-only">
        {Object.keys(outcomes).length ? t("service.progress", { done, total: checks.length }) : ""}
      </p>
      <ul className="flex flex-col divide-y rounded-lg border">
        {checks.map((check) => {
          const outcome = outcomes[check.id];
          return (
            <li key={check.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {outcome === "running" ? (
                  <Badge variant="outline">{t("service.badgeRunning")}</Badge>
                ) : outcome ? (
                  <Badge variant={BADGE[outcome.status]}>{t(`service.statuses.${outcome.status}`)}</Badge>
                ) : (
                  <Badge variant="outline">{t("service.notRun")}</Badge>
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
      {hint && (
        <p role="alert" className="text-sm break-words text-destructive">
          {hint}
        </p>
      )}
    </div>
  );
}
