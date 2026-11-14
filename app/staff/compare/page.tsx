import Form from "next/form";
import { Suspense } from "react";
import { DataStatusLabel, itemDataStatus } from "@/components/data-status-label";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/auth";
import { KIND_LABELS } from "@/lib/explore/filter";
import { parseSlugPair, type CompareItem } from "@/lib/staff-views/compare";
import { listMembers, loadComparison, type CompareSide, type Member } from "@/lib/staff-views/query";

export const metadata = { title: "Compare members" };

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function Page({ searchParams }: PageProps<"/staff/compare">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Compare members</h1>
        <p className="text-muted-foreground">
          Two members&apos; top five from the public ranking, side by side. The public ranking uses public profile
          information only, never what a member entered privately. Every line is a potential match, not a decision.
        </p>
      </div>
      <Suspense fallback={<CompareSkeleton />}>
        <Comparison searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function CompareSkeleton() {
  return (
    <LoadingState label="Loading the members…" className="gap-6">
      <div className="grid items-end gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-8 w-24" />
      </div>
    </LoadingState>
  );
}

/** Reads the session and the URL, so it streams in behind the Suspense boundary above. */
async function Comparison({ searchParams }: Pick<PageProps<"/staff/compare">, "searchParams">) {
  // The proxy already sends members away; this refuses them on the server too.
  const viewer = await requireRole("staff");
  const params = await searchParams;
  const a = first(params.a);
  const b = first(params.b);
  const members = await listMembers(viewer.claims);
  const pair = parseSlugPair(a, b);
  const result = pair.ok ? await loadComparison(viewer.claims, pair.a, pair.b) : null;
  const error = !pair.ok ? (a || b ? pair.error : null) : result?.ok ? null : (result?.error ?? null);

  if (members.length < 2) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
        Comparing needs at least two member companies, and there {members.length === 1 ? "is one" : "are none"} yet. Run
        the member import under Service checks first.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PickForm members={members} a={a ?? ""} b={b ?? ""} error={error} />
      {!pair.ok || !result?.ok ? (
        error ? null : <p className="text-sm text-muted-foreground">Pick two members and press Compare.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result.comparison.shared.length === 0
              ? "No opportunity is in both top fives."
              : `${result.comparison.shared.length} ${result.comparison.shared.length === 1 ? "opportunity is" : "opportunities are"} in both top fives, marked "In both".`}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <SideCard side={result.comparison.a} />
            <SideCard side={result.comparison.b} />
          </div>
        </>
      )}
    </div>
  );
}

/** A plain GET form: the choice lives in the URL, and the pickers keep it after an error. */
function PickForm({ members, a, b, error }: { members: Member[]; a: string; b: string; error: string | null }) {
  const errorId = "compare-error";
  const picker = (name: "a" | "b", label: string, value: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`compare-${name}`}>{label}</Label>
      <select
        id={`compare-${name}`}
        name={name}
        defaultValue={value}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={SELECT_CLASS}
      >
        <option value="">Choose a member</option>
        {members.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <Form action="/staff/compare" key={`${a}|${b}`} className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {picker("a", "First member", a)}
        {picker("b", "Second member", b)}
        <Button type="submit">Compare</Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Form>
  );
}

function SideCard({ side }: { side: CompareSide }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2 className="text-heading break-words">{side.name}</h2>
        </CardTitle>
        <CardDescription>
          {side.top.length === 0
            ? "No potential matches in the public ranking yet. They appear after the nightly matching has run for this member."
            : side.top.length < 5
              ? `Only ${side.top.length} potential ${side.top.length === 1 ? "match" : "matches"} in the public ranking.`
              : "The top five potential matches in the public ranking."}
        </CardDescription>
      </CardHeader>
      {side.top.length ? (
        <CardContent>
          <ol className="flex flex-col divide-y">
            {side.top.map((item) => (
              <CompareRow key={item.opportunityId} item={item} />
            ))}
          </ol>
        </CardContent>
      ) : null}
    </Card>
  );
}

function CompareRow({ item }: { item: CompareItem }) {
  const status = itemDataStatus(item);
  return (
    <li className={`flex gap-3 py-3 first:pt-0 last:pb-0 ${item.inBoth ? "-mx-2 rounded-lg bg-muted px-2" : ""}`} data-in-both={item.inBoth || undefined}>
      <span className="w-5 shrink-0 text-sm font-medium tabular-nums text-muted-foreground" aria-hidden>
        {item.position}.
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
          {item.inBoth ? <Badge>In both</Badge> : null}
          {status ? <DataStatusLabel kind={status} date={item.cachedAt} /> : null}
          <span className="text-muted-foreground">{item.source}</span>
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium break-words underline-offset-4 hover:underline"
        >
          {item.title}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p className="text-sm break-words text-muted-foreground">{item.why ?? "Not judged yet, so there is no reason written down."}</p>
      </div>
    </li>
  );
}
