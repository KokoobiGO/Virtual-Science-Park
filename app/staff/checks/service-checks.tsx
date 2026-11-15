"use client";

import { CircleAlert, CircleCheck, CircleDashed, Info, LoaderCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { CheckResult } from "@/lib/nvidia-checks";

type Check = { id: string; label: string };
type Outcome = CheckResult & { hint?: string | null };

/** Each result is a word and an icon, never colour alone. */
const LOOK = {
  PASS: { className: "text-success", Icon: CircleCheck },
  FAIL: { className: "text-destructive", Icon: CircleAlert },
  NOTE: { className: "text-info", Icon: Info },
} as const;

/**
 * One service as one row: its name, one status word, and the Run button. The
 * checks and what the service answered sit folded under "Details".
 *
 * Runs every check of the service in parallel, one request each to
 * `${endpoint}?check=<id>`, and shows results as they arrive. Words in the
 * reader's language (C19); check names and results as the server sends them.
 */
export function ServiceChecks({
  title,
  text,
  endpoint,
  button,
  checks,
}: {
  title: string;
  text: string;
  endpoint: string;
  button: string;
  checks: Check[];
}) {
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
    <section className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="min-w-0 flex-1 font-medium break-words">{title}</h2>
        {running ? (
          <Status Icon={LoaderCircle} spin label={t("service.badgeRunning")} />
        ) : allDone ? (
          <Status {...(problems ? LOOK.FAIL : LOOK.PASS)} label={t(`service.statuses.${problems ? "FAIL" : "PASS"}`)} />
        ) : (
          <Status Icon={CircleDashed} className="text-muted-foreground" label={t("service.notRun")} />
        )}
        <Button size="sm" onClick={runAll} aria-disabled={running || undefined} className="press aria-disabled:opacity-60">
          {running ? t("service.running") : button}
        </Button>
      </div>
      {/* Always in the page, so screen readers hear the progress. */}
      <p role="status" className="sr-only">
        {Object.keys(outcomes).length ? t("service.progress", { done, total: checks.length }) : ""}
      </p>
      {hint && (
        <p role="alert" className="animate-fade text-sm break-words text-destructive">
          {hint}
        </p>
      )}
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">{t("service.details")}</summary>
        <div className="mt-2 flex animate-slide-down flex-col gap-3">
          <p className="text-muted-foreground">{text}</p>
          <ul className="flex flex-col gap-3">
            {checks.map((check) => {
              const outcome = outcomes[check.id];
              return (
                <li key={check.id} className="flex flex-col gap-1">
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
                        {t("service.notRun")}
                      </Badge>
                    )}
                    <span className="break-words">{check.label}</span>
                  </div>
                  {outcome && outcome !== "running" && <p className="break-words text-muted-foreground">{outcome.detail}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    </section>
  );
}

function Status({ Icon, label, className = "", spin = false }: { Icon: LucideIcon; label: string; className?: string; spin?: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-sm font-medium ${className}`}>
      <Icon aria-hidden className={`size-4 ${spin ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

const BADGE = { PASS: "success", FAIL: "destructive", NOTE: "info" } as const;

function StatusBadge({ status, label }: { status: Outcome["status"]; label: string }) {
  const { Icon } = LOOK[status];
  return (
    <Badge variant={BADGE[status]} className="animate-pop">
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
