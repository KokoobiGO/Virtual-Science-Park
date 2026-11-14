"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/i18n/translate";
import type { SnapshotResult } from "@/lib/inngest/functions/fetch-snapshot";

type State =
  | { kind: "idle" | "running" }
  | { kind: "error"; message: string }
  | { kind: "done"; seconds: number; snapshot: SnapshotResult };

/** Asks the fetch-snapshot job to fetch one page and shows the stored snapshot. Words in the reader's language (C19). */
export function FetchPageForm() {
  const t = useT("checks");
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state.kind === "running") return;
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json()) as { error?: string; seconds?: number; snapshot?: SnapshotResult };
      if (!res.ok || !body.snapshot) setState({ kind: "error", message: body.error ?? `${res.status}` });
      else setState({ kind: "done", seconds: body.seconds ?? 0, snapshot: body.snapshot });
    } catch (error) {
      setState({ kind: "error", message: String(error) });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Label htmlFor="snapshot-url">{t("fetch.label")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="snapshot-url"
            type="text"
            inputMode="url"
            required
            placeholder="https://www.bluesciencepark.se/"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-invalid={state.kind === "error" || undefined}
            aria-describedby={state.kind === "error" ? "snapshot-error" : undefined}
          />
          <Button type="submit" aria-disabled={state.kind === "running" || undefined} className="aria-disabled:opacity-60">
            {state.kind === "running" ? t("fetch.running") : t("fetch.submit")}
          </Button>
        </div>
      </form>

      {state.kind === "error" && (
        <p id="snapshot-error" role="alert" className="text-sm break-words text-destructive">
          {state.message}
        </p>
      )}
      <p role="status" className="sr-only">
        {state.kind === "running" ? t("fetch.statusRunning") : state.kind === "done" ? t("fetch.statusDone") : ""}
      </p>

      {state.kind === "done" && (
        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{state.snapshot.unchanged ? t("fetch.unchanged") : t("fetch.stored")}</Badge>
            <span className="font-medium break-words">{state.snapshot.title ?? t("fetch.noTitle")}</span>
          </div>
          <p className="text-sm break-words text-muted-foreground">
            {t("fetch.details", {
              url: state.snapshot.url,
              lang: state.snapshot.lang ?? "",
              chars: formatNumber(state.snapshot.chars, t.locale),
              retrievedAt: state.snapshot.retrievedAt,
              seconds: state.seconds,
              id: state.snapshot.snapshotId,
            })}
          </p>
          <p className="text-sm break-words whitespace-pre-wrap">{state.snapshot.preview}…</p>
        </div>
      )}
    </div>
  );
}
