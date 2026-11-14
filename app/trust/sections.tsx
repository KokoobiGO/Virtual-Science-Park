import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileField } from "@/lib/schemas";
import type { SourceHealth } from "@/lib/sources/health";
import {
  accuracyText,
  ELIGIBILITY_SENTENCE,
  formatDateTime,
  formatDay,
  formatSeconds,
  HAND_CHECK_NOT_FINISHED,
  handCheckStarted,
  KNOWN_LIMITS,
  NOT_MEASURED,
  percentOf,
  summarizeStaffSession,
  summarizeTimedTest,
  type FileResult,
  type MatchingResult,
  type Run,
} from "@/lib/trust/report";
import type {
  LinkCheckSummary,
  PrivacySummary,
  ProfileAccuracySummary,
  QuoteCheckSummary,
  QuoteTotals,
  RedTeamSummary,
  StaffSessionResults,
  TimedTestResults,
} from "@/lib/trust/shapes";

const FIELDS_PER_PROFILE = ProfileField.options.length;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ title, description, when, children }: { title: string; description: string; when?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {when ? <p className="text-xs text-muted-foreground">{when}</p> : null}
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function NotMeasured({ text = NOT_MEASURED }: { text?: string }) {
  return <p className="font-medium">{text}</p>;
}

function Unreadable({ what, problem }: { what: string; problem: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{what}, but this page cannot read it, so no number is shown.</p>
      <p className="text-xs break-words text-muted-foreground">{problem}</p>
    </div>
  );
}

/** The date in a card's corner, for a stored run. Nothing when there is no run: the card says "not measured yet". */
function runWhen(run: Run<unknown>): ReactNode {
  return run.status === "not_measured" ? null : <span>Run {formatDateTime(run.ranAt)}</span>;
}

function fileWhen(result: FileResult<unknown>): ReactNode {
  return result.status === "measured" ? <span>Held {formatDay(result.date)}</span> : null;
}

function Table({ head, rows, foot }: { head: ReactNode[]; rows: ReactNode[][]; foot?: ReactNode[][] }) {
  const cell = "px-2 py-1.5 align-top first:pl-0 last:pr-0";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`${cell} font-medium`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b last:border-b-0">
              {row.map((c, i) => (
                <td key={i} className={cell}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot?.length ? (
          <tfoot className="font-medium">
            {foot.map((row, r) => (
              <tr key={r} className="border-t">
                {row.map((c, i) => (
                  <td key={i} className={cell}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function ProfileAccuracySection({ run }: { run: Run<ProfileAccuracySummary> }) {
  return (
    <Section
      title="Profile accuracy"
      description="The team checks every claim of the three gold profiles against the company's own pages. Accuracy is right claims out of checked claims; an unchecked claim never counts as right."
      when={runWhen(run)}
    >
      {run.status === "not_measured" ? <NotMeasured /> : null}
      {run.status === "unreadable" ? <Unreadable what="An accuracy run is stored" problem={run.problem} /> : null}
      {run.status === "measured" && !handCheckStarted(run.summary) ? (
        <>
          <NotMeasured text={HAND_CHECK_NOT_FINISHED} />
          <p className="text-muted-foreground">
            The latest run found 0 of {run.summary.total.all.claims} claims checked, over {run.summary.companies.length} gold profiles.
          </p>
        </>
      ) : null}
      {run.status === "measured" && handCheckStarted(run.summary) ? (
        <>
          <Table
            head={["Gold profile", "Stated claims", "Inferred claims", "Missing (page says nothing)"]}
            rows={run.summary.companies.map((c) => [c.company, accuracyText(c.stated), accuracyText(c.inferred), accuracyText(c.missing)])}
            foot={[["All gold profiles", accuracyText(run.summary.total.stated), accuracyText(run.summary.total.inferred), accuracyText(run.summary.total.missing)]]}
          />
          {!run.summary.complete ? (
            <p className="text-muted-foreground">
              The hand-check is not finished: {run.summary.total.all.checked} of {run.summary.total.all.claims} claims checked so far.
            </p>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

export function QuoteCheckSection({ run }: { run: Run<QuoteCheckSummary> }) {
  const totalRow = (name: string, t: QuoteTotals) => [
    name,
    `${t.quotesFound} of ${t.quotesTotal} (${percentOf(t.quotesFound, t.quotesTotal)})`,
    String(t.quotesTotal - t.quotesFound),
    `${t.droppedFields} of ${t.profileFields}`,
    "",
  ];
  return (
    <Section
      title="Quote check"
      description="Every quote behind a profile field must appear word for word in the stored page text. A field whose quotes fail twice is dropped and shown as missing, never kept without proof."
      when={runWhen(run)}
    >
      {run.status === "not_measured" ? <NotMeasured /> : null}
      {run.status === "unreadable" ? <Unreadable what="A quote-check run is stored" problem={run.problem} /> : null}
      {run.status === "measured" ? (
        <Table
          head={["Profile", "Quotes found on the page", "Quotes not found", "Fields dropped", "Profiled"]}
          rows={run.summary.gold.companies.map((c) => [
            c.slug,
            `${c.quotesFound} of ${c.quotesTotal} (${percentOf(c.quotesFound, c.quotesTotal)})`,
            String(c.quotesTotal - c.quotesFound),
            c.dropped.length ? `${c.dropped.length} of ${FIELDS_PER_PROFILE}: ${c.dropped.join(", ")}` : `0 of ${FIELDS_PER_PROFILE}`,
            formatDateTime(new Date(c.storedAt)),
          ])}
          foot={[totalRow("All gold profiles", run.summary.gold.total), totalRow(`All ${run.summary.all.runs} profiled members`, run.summary.all)]}
        />
      ) : null}
    </Section>
  );
}

export function LinkHealthSection({ run }: { run: Run<LinkCheckSummary> }) {
  return (
    <Section
      title="Link health"
      description="Every opportunity's source link, and every source a week card cites, requested once. Unclear: the site would not answer a script (a login, a refusal or no answer), so a person must look."
      when={runWhen(run)}
    >
      {run.status === "not_measured" ? <NotMeasured /> : null}
      {run.status === "unreadable" ? <Unreadable what="A link-check run is stored" problem={run.problem} /> : null}
      {run.status === "measured" ? (
        <Table
          head={["Links checked", "Working", "Broken", "Unclear: check by hand"]}
          rows={[
            [
              String(run.summary.checked),
              `${run.summary.ok} (${percentOf(run.summary.ok, run.summary.checked)})`,
              String(run.summary.broken),
              String(run.summary.blocked),
            ],
          ]}
        />
      ) : null}
    </Section>
  );
}

const VERDICT_LABEL: Record<SourceHealth["verdict"], string> = {
  ok: "Live",
  stale: "Live, stale",
  cached: "Cached copy",
  hand_entered: "Hand-entered",
};

export function SourceStatusSection({ sources }: { sources: SourceHealth[] }) {
  return (
    <Section
      title="Source status"
      description="Where the opportunities come from. Live: read from the source within the last 48 hours. Cached: a recorded copy, with its date. Hand-entered: written by the team and marked simulated."
    >
      {sources.length ? (
        <Table
          head={["Source", "Status", "Last success", "Items", "Note"]}
          rows={sources.map((s) => [
            s.label,
            <Badge key="v" variant={s.verdict === "ok" ? "secondary" : s.verdict === "stale" ? "destructive" : "outline"}>
              {VERDICT_LABEL[s.verdict]}
            </Badge>,
            s.lastSuccessAt ? formatDateTime(s.lastSuccessAt) : "never",
            s.itemCount === null ? "-" : String(s.itemCount),
            sourceNote(s),
          ])}
        />
      ) : (
        <NotMeasured />
      )}
    </Section>
  );
}

function sourceNote(s: SourceHealth): string {
  const parts: string[] = [];
  if (s.verdict === "cached") parts.push(s.cachedAt ? `Copy from ${formatDateTime(s.cachedAt)}.` : "Date of the copy unknown.");
  if (s.verdict === "stale") parts.push("No success in the last 48 hours.");
  if (s.message) parts.push(s.message);
  return parts.join(" ");
}

const MODE_LABEL = { public: "Public", personal: "Personal" } as const;

export function MatchingSection({ matching }: { matching: MatchingResult }) {
  return (
    <Section
      title="Matching"
      description="The judge reads each ranked match and keeps it, with a reason and a next step, or rejects it with a reason. It can reject a match but never adds one. The public ranking uses public profile data only; the personal one adds the company's private data."
      when={matching.status === "measured" ? <span>Last judged {formatDateTime(matching.ranAt)}</span> : null}
    >
      <p className="rounded-lg border bg-muted/50 px-3 py-2 font-medium">{ELIGIBILITY_SENTENCE}</p>
      {matching.status === "not_measured" ? <NotMeasured /> : null}
      {matching.status === "measured" ? (
        <>
          <p className="text-muted-foreground">
            {matching.scope === "all_members_public"
              ? "Counted over every member's public ranking. Personal rankings are private to each company, so staff cannot count them."
              : "Counted over your own company's matches only: other members' matches are private to them."}
          </p>
          <Table
            head={["Ranking", "Members", "Judged", "Kept", "Rejected", "Not judged yet"]}
            rows={matching.modes.map((m) => [
              MODE_LABEL[m.mode],
              String(m.companies),
              String(m.judged),
              `${m.kept} (${percentOf(m.kept, m.judged)})`,
              `${m.rejected} (${percentOf(m.rejected, m.judged)})`,
              String(m.rankedUnjudged),
            ])}
          />
        </>
      ) : null}
    </Section>
  );
}

export function RedTeamSection({ run }: { run: Run<RedTeamSummary> }) {
  return (
    <Section
      title="Red-team tests"
      description="Prompts written on purpose to make the system misbehave, in groups. The pass rate is the share of prompts in a group that the system handled as it should."
      when={runWhen(run)}
    >
      {run.status === "not_measured" ? <NotMeasured /> : null}
      {run.status === "unreadable" ? <Unreadable what="A red-team run is stored" problem={run.problem} /> : null}
      {run.status === "measured" ? (
        <Table
          head={["Group", "Passed", "Pass rate"]}
          rows={run.summary.groups.map((g) => [g.group, `${g.passed} of ${g.total}`, percentOf(g.passed, g.total)])}
        />
      ) : null}
    </Section>
  );
}

export function PrivacySection({ run }: { run: Run<PrivacySummary> }) {
  return (
    <Section
      title="Privacy tests"
      description="Row-level security tests against the database: one member's account must get no rows of another company's private data, and staff never read chats."
      when={runWhen(run)}
    >
      {run.status === "not_measured" ? <NotMeasured /> : null}
      {run.status === "unreadable" ? <Unreadable what="A privacy-test run is stored" problem={run.problem} /> : null}
      {run.status === "measured" ? (
        <p>
          <span className="font-medium">
            {run.summary.passed} of {run.summary.total}
          </span>{" "}
          tests passed ({percentOf(run.summary.passed, run.summary.total)}).
        </p>
      ) : null}
    </Section>
  );
}

const METHOD_LABEL = { with_app: "With the app", without_app: "Without the app (usual search)" } as const;

export function TimedTestSection({ result }: { result: FileResult<TimedTestResults> }) {
  return (
    <Section
      title="Timed test"
      description="Members do the same task with the app and without it, against the clock."
      when={fileWhen(result)}
    >
      {result.status === "not_measured" ? <NotMeasured /> : null}
      {result.status === "unreadable" ? <Unreadable what="A timed-test results file is there" problem={result.problem} /> : null}
      {result.status === "measured" ? (
        <>
          <p>
            <span className="text-muted-foreground">Task: </span>
            {result.data.task}
          </p>
          <Table
            head={["Method", "Trials", "Completed", "Median time (completed)"]}
            rows={summarizeTimedTest(result.data).map((m) => [
              METHOD_LABEL[m.method],
              String(m.trials),
              String(m.completed),
              m.medianSeconds === null ? "-" : formatSeconds(m.medianSeconds),
            ])}
          />
          {result.data.notes ? <p className="text-muted-foreground">{result.data.notes}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

const KIND_LABEL = { match: "Suggested matches", connection: "Suggested connections", profile: "Company profiles" } as const;

export function StaffSessionSection({ result }: { result: FileResult<StaffSessionResults> }) {
  return (
    <Section
      title="Staff session"
      description="BSP staff look at what the system suggests and rate each item."
      when={fileWhen(result)}
    >
      {result.status === "not_measured" ? <NotMeasured /> : null}
      {result.status === "unreadable" ? <Unreadable what="A staff-session results file is there" problem={result.problem} /> : null}
      {result.status === "measured" ? (
        <>
          <p className="text-muted-foreground">
            {result.data.staff} {result.data.staff === 1 ? "member" : "members"} of BSP staff took part.
          </p>
          <Table
            head={["Rated", "Useful", "Not useful", "Unsure"]}
            rows={summarizeStaffSession(result.data).map((s) => [
              KIND_LABEL[s.kind],
              `${s.useful} of ${s.total}`,
              String(s.notUseful),
              String(s.unsure),
            ])}
          />
          {result.data.notes ? <p className="text-muted-foreground">{result.data.notes}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

export function KnownLimitsSection() {
  return (
    <Section title="Known limits" description="What the numbers above do not prove.">
      <ul className="flex list-disc flex-col gap-2 pl-5">
        {KNOWN_LIMITS.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </Section>
  );
}
