"use client";

import { CircleAlert, CircleCheck, CircleDashed, Info, LoaderCircle, Play } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { CheckResult } from "@/lib/nvidia-checks";

type Check = { id: string; label: string };
type Outcome = CheckResult & { hint?: string | null };

/** Each result is a word and an icon, never colour alone. */
const LOOK = {
  PASS: { variant: "success", Icon: CircleCheck },
  FAIL: { variant: "destructive", Icon: CircleAlert },
  NOTE: { variant: "info", Icon: Info },
} as const;

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
  const finished = Object.values(outcomes).filter((o): o is Outcome => o !== "running");
  const done = finished.length;
  const problems = finished.filter((o) => o.status === "FAIL").length;
  const allDone = done === checks.length && done > 0;

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
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runAll} aria-disabled={running || undefined} className="press aria-disabled:opacity-60">
          {running ? <LoaderCircle aria-hidden className="animate-spin" /> : <Play aria-hidden />}
          {running ? t("service.running") : button}
        </Button>
        {allDone ? (
          <span
            key={`${done}-${problems}`}
            className={`flex animate-pop items-center gap-1.5 text-sm font-medium ${problems ? "text-destructive" : "text-success"}`}
          >
            {problems ? <CircleAlert aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />}
            {problems ? t("service.summaryProblems", { count: problems, total: checks.length }) : t("service.summaryOk")}
          </span>
        ) : null}
      </div>
      {/* Always in the page, so screen readers hear the progress. */}
      <p role="status" className="sr-only">
        {Object.keys(outcomes).length ? t("service.progress", { done, total: checks.length }) : ""}
      </p>
      <ul className="flex flex-col divide-y rounded-lg border bg-card shadow-card">
        {checks.map((check) => {
          const outcome = outcomes[check.id];
          return (
            <li key={check.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {outcome === "running" ? (
                  <Badge variant="outline">
                    <LoaderCircle aria-hidden className="animate-spin" />
                    {t("service.badgeRunning")}
                  </Badge>
                ) : outcome ? (
                  <StatusBadge status={outcome.status} label={t(`service.statuses.${outcome.status}`)} />
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <CircleDashed aria-hidden />
                    {t("service.notRun")}
                  </Badge>
                )}
                <span className="font-medium break-words">{check.label}</span>
              </div>
              {outcome && outcome !== "running" && (
                <p className="animate-slide-down text-sm break-words text-muted-foreground">{outcome.detail}</p>
              )}
            </li>
          );
        })}
      </ul>
      {hint && (
        <p role="alert" className="animate-fade text-sm break-words text-destructive">
          {hint}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: Outcome["status"]; label: string }) {
  const { variant, Icon } = LOOK[status];
  return (
    <Badge variant={variant} className="animate-pop">
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
