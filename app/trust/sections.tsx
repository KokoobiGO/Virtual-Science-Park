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
  HAND_CHECK_NOT_FINISHED,
  handCheckStarted,
  KNOWN_LIMITS,
  NOT_MEASURED,
  percentOf,
  ratingText,
  summarizeStaffSession,
  summarizeTimedTest,
  timedRunText,
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

const MATCHING_SCOPE_TEXT = {
  all_members:
    "Counted over every member's ranked matches (each company's top 20 now), public and personal, by the matching eval. Only totals are stored: no member's own matches are shown.",
  all_members_public:
    "The matching eval has not been stored yet, so this is your own count: every member's public ranking. Personal rankings are private to each company, so staff cannot count them.",
  own_company:
    "The matching eval has not been stored yet, so this is your own count: your own company's matches only, since other members' matches are private to them.",
} as const;

function matchingWhen(matching: MatchingResult): ReactNode {
  if (matching.status === "unreadable") return <span>Run {formatDateTime(matching.ranAt)}</span>;
  if (matching.status !== "measured") return null;
  const judged = matching.lastJudgedAt ? `last judged ${formatDateTime(matching.lastJudgedAt)}` : "nothing judged yet";
  return matching.countedAt ? (
    <span>
      Counted {formatDateTime(matching.countedAt)}, {judged}
    </span>
  ) : (
    <span>{judged.charAt(0).toUpperCase() + judged.slice(1)}</span>
  );
}

export function MatchingSection({ matching }: { matching: MatchingResult }) {
  return (
    <Section
      title="Matching"
      description="The judge reads each ranked match and keeps it, with a reason and a next step, or rejects it with a reason. It can reject a match but never adds one. The public ranking uses public profile data only; the personal one adds the company's private data."
      when={matchingWhen(matching)}
    >
      <p className="rounded-lg border bg-muted/50 px-3 py-2 font-medium">{ELIGIBILITY_SENTENCE}</p>
      {matching.status === "not_measured" ? <NotMeasured /> : null}
      {matching.status === "unreadable" ? <Unreadable what="A matching run is stored" problem={matching.problem} /> : null}
      {matching.status === "measured" ? (
        <>
          <p className="text-muted-foreground">{MATCHING_SCOPE_TEXT[matching.scope]}</p>
          <Table
            head={["Ranking", "Members", "Ranked", "Judged", "Kept", "Rejected", "Not judged yet"]}
            rows={matching.modes.map((m) => [
              MODE_LABEL[m.mode],
              String(m.companies),
              String(m.ranked),
              String(m.judged),
              `${m.kept} (${percentOf(m.kept, m.judged)})`,
              `${m.rejected} (${percentOf(m.rejected, m.judged)})`,
              String(m.notJudgedYet),
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

const TASK_LABEL = { A: "A: test facilities for an underwater sensor", B: "B: funding for Techinova, safer electricity grids" } as const;

export function TimedTestSection({ result }: { result: FileResult<TimedTestResults> }) {
  return (
    <Section
      title="Timed test"
      description="A tester does each of two tasks once by hand (their own search) and once with the tool, against the clock. One point for each correct result found within 15 minutes, scored against the team's answer key."
      when={fileWhen(result)}
    >
      {result.status === "not_measured" ? <NotMeasured /> : null}
      {result.status === "unreadable" ? <Unreadable what="A timed-test results file is there" problem={result.problem} /> : null}
      {result.status === "measured" ? (
        <>
          <Table
            head={["Task", "Tester", "By hand", "With the tool"]}
            rows={summarizeTimedTest(result.data).map((row) => [
              TASK_LABEL[row.task],
              row.participant,
              timedRunText(row.byHand, row.keyItems),
              timedRunText(row.withTool, row.keyItems),
            ])}
          />
          <p className="text-muted-foreground">Time is the time used, 15 minutes at most; &quot;not finished&quot; means the tester gave up or the time ran out.</p>
          {result.data.notes ? <p className="text-muted-foreground">{result.data.notes}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

export function StaffSessionSection({ result }: { result: FileResult<StaffSessionResults> }) {
  const summary = result.status === "measured" ? summarizeStaffSession(result.data) : null;
  return (
    <Section
      title="Staff session"
      description="BSP staff rate each claim of a gold member's profile right, wrong or unsure against the source, and each of its top five public matches relevant or not."
      when={fileWhen(result)}
    >
      {result.status === "not_measured" ? <NotMeasured /> : null}
      {result.status === "unreadable" ? <Unreadable what="A staff-session results file is there" problem={result.problem} /> : null}
      {result.status === "measured" && summary ? (
        <>
          <p className="text-muted-foreground">
            {result.data.staff} {result.data.staff === 1 ? "member" : "members"} of BSP staff took part.
          </p>
          <Table
            head={["Gold member", "Profile claims right", "Top-five matches relevant"]}
            rows={summary.members.map((m) => [m.member, claimsText(m.claims), ratingText(m.top5)])}
            foot={summary.members.length > 1 ? [["All gold members", claimsText(summary.total.claims), ratingText(summary.total.top5)]] : undefined}
          />
          {summary.quotes.length ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">What staff said, quoted with their permission:</p>
              {summary.quotes.map((quote, i) => (
                <blockquote key={i} className="border-l-2 pl-3 italic">
                  &ldquo;{quote}&rdquo;
                </blockquote>
              ))}
            </div>
          ) : null}
          {summary.quotesWithheld ? (
            <p className="text-muted-foreground">
              {summary.quotesWithheld} more {summary.quotesWithheld === 1 ? "quote is" : "quotes are"} not shown: no permission to quote.
            </p>
          ) : null}
          {result.data.notes ? <p className="text-muted-foreground">{result.data.notes}</p> : null}
        </>
      ) : null}
    </Section>
  );
}

/** "5 of 7 (71%); 1 wrong, 1 unsure". */
function claimsText(claims: { rated: number; good: number; wrong: number; unsure: number }): string {
  return claims.rated ? `${ratingText(claims)}; ${claims.wrong} wrong, ${claims.unsure} unsure` : ratingText(claims);
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
