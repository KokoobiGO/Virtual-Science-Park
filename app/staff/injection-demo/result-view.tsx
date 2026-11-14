import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeLocations, LOCATION_LABELS } from "@/lib/injection/detect";
import { VERDICT_TEXT, type InjectionDemoResult, type InjectionDemoStep } from "@/lib/injection/demo-result";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", dateStyle: "medium", timeStyle: "short" });

const STEP_NAMES: Record<InjectionDemoStep["step"], string> = { profiler: "Profiler", judge: "Judge" };
const INPUT_NAMES: Record<InjectionDemoStep["input"], string> = {
  extracted: "on the extracted page text",
  raw: "on the raw text, every planted instruction put back in",
};

/** One recorded run of scripts/injection-demo.ts (B13): the label, what was hidden, and each model step. */
export function InjectionDemoView({ result }: { result: InjectionDemoResult }) {
  return (
    <div className="flex flex-col gap-6">
      <Summary result={result} />
      <Hidden result={result} />
      {result.steps.map((step) => (
        <StepCard key={`${step.step}-${step.input}`} step={step} />
      ))}
      {result.notes.length ? (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <h2 className="font-medium text-foreground">How the run was set up</h2>
          <ul className="list-disc space-y-1 pl-5">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PassBadge({ pass }: { pass: boolean }) {
  return <Badge variant={pass ? "success" : "destructive"}>{pass ? "PASS" : "FAIL"}</Badge>;
}

function Summary({ result }: { result: InjectionDemoResult }) {
  const passed = result.steps.filter((s) => s.pass).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PassBadge pass={result.pass} />
          {passed} of {result.steps.length} model steps kept the hidden instructions out of their answer
        </CardTitle>
        <CardDescription>
          Run on {when.format(new Date(result.ranAt))} with {result.model}; the judge read {result.judgedFor}&apos;s public profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="font-medium">Label on the page</p>
        {result.detector.label ? (
          <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-warning">{result.detector.label}</p>
        ) : (
          <p className="text-destructive">The detector did not flag the page.</p>
        )}
        {result.detector.locations.length ? (
          <p className="text-muted-foreground">Found in {describeLocations(result.detector.locations)}.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Hidden({ result }: { result: InjectionDemoResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What was hidden</CardTitle>
        <CardDescription>
          The page text came from the repo&apos;s extractor ({result.extractor.method}, {result.extractor.chars} characters). It reads
          text, not CSS, so it keeps text that only a style hides.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {result.extractor.kept.map((item) => (
            <li key={item.where} className="flex flex-col gap-1.5 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{LOCATION_LABELS[item.where]}</span>
                <Badge variant={item.kept ? "warning" : "muted"}>{item.kept ? "Kept by the extractor" : "Dropped by the extractor"}</Badge>
              </div>
              <p className="text-muted-foreground">{item.how}</p>
              <blockquote className="border-l-2 pl-3 italic">{item.text}</blockquote>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StepCard({ step }: { step: InjectionDemoStep }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PassBadge pass={step.pass} />
          {STEP_NAMES[step.step]} {INPUT_NAMES[step.input]}
        </CardTitle>
        <CardDescription>{VERDICT_TEXT[step.verdict]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          <span className="font-medium">Planted instructions the model was given: </span>
          {step.instructionsInInput.length ? describeLocations(step.instructionsInInput) : "none"}.
        </p>
        <div className="flex flex-col gap-1">
          <p className="font-medium">What the model answered</p>
          <ul className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2 font-mono text-xs break-words">
            {step.answer.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
        <p>
          <span className="font-medium">Refused words or planted quotes in the model&apos;s answer: </span>
          {step.modelWrote.length ? step.modelWrote.join(", ") : "none"}
        </p>
        <p>
          <span className="font-medium">Checks: </span>
          {step.checks}
        </p>
        <p>
          <span className="font-medium">In what would be stored: </span>
          {step.stored.length ? step.stored.join(", ") : "none"}
        </p>
        <p className="text-xs text-muted-foreground">
          {step.calls} model {step.calls === 1 ? "call" : "calls"}, {step.seconds} s
        </p>
      </CardContent>
    </Card>
  );
}
