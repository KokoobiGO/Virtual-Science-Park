"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SnapshotResult } from "@/lib/inngest/functions/fetch-snapshot";

type State =
  | { kind: "idle" | "running" }
  | { kind: "error"; message: string }
  | { kind: "done"; seconds: number; snapshot: SnapshotResult };

/** Asks the fetch-snapshot job to fetch one page and shows the stored snapshot. */
export function FetchPageForm() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
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
        <Label htmlFor="snapshot-url">Page address</Label>
        <div className="flex gap-2">
          <Input
            id="snapshot-url"
            type="text"
            inputMode="url"
            required
            placeholder="https://www.bluesciencepark.se/"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" disabled={state.kind === "running"}>
            {state.kind === "running" ? "Fetching…" : "Fetch page"}
          </Button>
        </div>
      </form>

      {state.kind === "error" && <p className="text-sm break-words text-destructive">{state.message}</p>}

      {state.kind === "done" && (
        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{state.snapshot.unchanged ? "Unchanged" : "Stored"}</Badge>
            <span className="font-medium">{state.snapshot.title ?? "(no title)"}</span>
          </div>
          <p className="text-sm break-words text-muted-foreground">
            {state.snapshot.url} · language {state.snapshot.lang} · {state.snapshot.chars.toLocaleString("en")} characters ·
            retrieved {state.snapshot.retrievedAt} · {state.seconds} s · snapshot {state.snapshot.snapshotId}
          </p>
          <p className="text-sm whitespace-pre-wrap">{state.snapshot.preview}…</p>
        </div>
      )}
    </div>
  );
}
