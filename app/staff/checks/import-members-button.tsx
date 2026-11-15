"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import type { MemberImportResult } from "@/lib/inngest/functions/import-members";

type State =
  | { kind: "idle" }
  | { kind: "running"; status: string }
  | { kind: "error"; message: string }
  | { kind: "done"; result: MemberImportResult };

const POLL_MS = 3_000;
const GIVE_UP_MS = 4 * 60_000;

/** Starts the import-members job and polls until it has finished. Words in the reader's language (C19); job statuses as Inngest sends them. */
export function ImportMembersButton() {
  const t = useT("checks");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    if (state.kind === "running") return;
    setState({ kind: "running", status: t("import.starting") });
    try {
      const start = await fetch("/api/members/import", { method: "POST" });
      const started = (await start.json()) as { eventId?: string; error?: string };
      if (!start.ok || !started.eventId) throw new Error(started.error ?? `${start.status}`);

      const deadline = Date.now() + GIVE_UP_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const res = await fetch(`/api/members/import?event=${started.eventId}`, { cache: "no-store" });
        const body = (await res.json()) as { status?: string; finished?: boolean; output?: unknown; error?: string };
        if (!res.ok) throw new Error(body.error ?? `${res.status}`);
        if (!body.finished) {
          setState({ kind: "running", status: body.status ?? "Running" });
          continue;
        }
        if (body.status !== "Completed") {
          throw new Error(t("import.jobEnded", { status: body.status?.toLowerCase() ?? "", output: JSON.stringify(body.output) }));
        }
        setState({ kind: "done", result: body.output as MemberImportResult });
        return;
      }
      throw new Error(t("import.tooLong"));
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} aria-disabled={state.kind === "running" || undefined} className="press aria-disabled:opacity-60">
          {state.kind === "running" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Users aria-hidden />}
          {state.kind === "running" ? t("import.running") : t("import.button")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {state.kind === "running" ? t("import.status", { status: state.status }) : state.kind === "done" ? t("import.finished") : ""}
        </span>
      </div>

      {state.kind === "error" && (
        <p role="alert" className="flex animate-fade items-start gap-1.5 text-sm break-words text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{state.message}</span>
        </p>
      )}

      {state.kind === "done" && (
        <div className="flex animate-rise flex-col gap-2 rounded-lg border bg-card px-4 py-3 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={state.result.failed.length ? "destructive" : "success"} className="animate-pop">
              {state.result.failed.length ? <CircleAlert aria-hidden /> : <CircleCheck aria-hidden />}
              {state.result.failed.length ? t("import.partly") : t("import.done")}
            </Badge>
            <span className="font-medium">{t("import.imported", { imported: state.result.imported, total: state.result.total })}</span>
          </div>
          <p className="text-sm break-words text-muted-foreground">
            {t("import.websiteMissing", { list: state.result.websiteMissing.length ? state.result.websiteMissing.join(", ") : t("import.none") })}
          </p>
          {state.result.failed.map((member) => (
            <p key={member.slug} className="text-sm break-words text-destructive">
              {member.slug}: {member.error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
