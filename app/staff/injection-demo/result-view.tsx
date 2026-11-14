import { Eye, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { createTranslator, type Translator } from "@/lib/i18n/translate";
import { INJECTION_LABEL, type InjectionLocation } from "@/lib/injection/detect";
import type { InjectionDemoResult, InjectionDemoStep } from "@/lib/injection/demo-result";

/** "the page text, an HTML comment and a meta tag ...", as describeLocations() in lib/injection/detect.ts writes it in English. */
function places(locations: readonly InjectionLocation[], t: Translator<"injection">): string {
  const labels = locations.map((where) => t(`locations.${where}`));
  if (labels.length <= 1) return labels[0] ?? "";
  return createTranslator(t.locale, "common")("listAnd", { list: labels.slice(0, -1).join(", "), last: labels.at(-1)! });
}

/**
 * One recorded run of scripts/injection-demo.ts (B13): the label, what was hidden, and each model step.
 * Our words follow `locale` (C19); what the run recorded (planted text, answers, checks, notes) is shown as recorded.
 */
export function InjectionDemoView({ result, locale = DEFAULT_LOCALE }: { result: InjectionDemoResult; locale?: Locale }) {
  const t = createTranslator(locale, "injection");
  return (
    <div className="flex flex-col gap-6 stagger">
      <Summary result={result} t={t} />
      <Hidden result={result} t={t} />
      {result.steps.map((step, i) => (
        <StepCard key={`${step.step}-${step.input}`} step={step} number={i + 2} t={t} />
      ))}
      {result.notes.length ? (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <h2 className="font-medium text-foreground">{t("setupTitle")}</h2>
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

function PassBadge({ pass, t }: { pass: boolean; t: Translator<"injection"> }) {
  return (
    <Badge variant={pass ? "success" : "destructive"}>
      {pass ? <ShieldCheck aria-hidden /> : <ShieldAlert aria-hidden />}
      {pass ? t("pass") : t("fail")}
    </Badge>
  );
}

/** A small label above a card's title, so a viewer can follow the story in order. */
function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium tracking-wide text-primary uppercase">{children}</p>;
}

function Summary({ result, t }: { result: InjectionDemoResult; t: Translator<"injection"> }) {
  const passed = result.steps.filter((s) => s.pass).length;
  // The detector's label is our own fixed text; show it in the reader's language when it is that text.
  const label = result.detector.label === INJECTION_LABEL ? t("detectorLabel") : result.detector.label;
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <Eyebrow>{t("eyebrow.result")}</Eyebrow>
        <CardTitle>
          <h2 className="flex flex-wrap items-center gap-2">
            <PassBadge pass={result.pass} t={t} />
            {t("summaryTitle", { passed, total: result.steps.length })}
          </h2>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          {/* D20: a recorded run read from a file, not a live one. */}
          <DataStatusLabel kind="cached" date={result.ranAt} locale={t.locale} />
          <span className="break-words">
            {t("ran", { date: formatDateTime(result.ranAt, t.locale), model: result.model, company: result.judgedFor })}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="font-medium">{t("labelTitle")}</p>
        {label ? (
          <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-warning">{label}</p>
        ) : (
          <p className="text-destructive">{t("notFlagged")}</p>
        )}
        {result.detector.locations.length ? (
          <p className="text-muted-foreground">{t("foundIn", { locations: places(result.detector.locations, t) })}</p>
        ) : null}
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{t("lookAt")}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function Hidden({ result, t }: { result: InjectionDemoResult; t: Translator<"injection"> }) {
  return (
    <Card>
      <CardHeader>
        <Eyebrow>
          {t("stepNumber", { n: 1 })} · {t("eyebrow.trap")}
        </Eyebrow>
        <CardTitle>
          <h2>{t("hiddenTitle")}</h2>
        </CardTitle>
        <CardDescription>{t("hiddenIntro", { method: result.extractor.method, chars: result.extractor.chars })}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {result.extractor.kept.map((item) => (
            <li key={item.where} className="flex flex-col gap-1.5 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t(`locations.${item.where}`)}</span>
                <Badge variant={item.kept ? "warning" : "muted"}>{item.kept ? t("kept") : t("dropped")}</Badge>
              </div>
              <p className="text-muted-foreground">{item.how}</p>
              <blockquote className="border-l-2 pl-3 break-words italic">{item.text}</blockquote>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StepCard({ step, number, t }: { step: InjectionDemoStep; number: number; t: Translator<"injection"> }) {
  const none = createTranslator(t.locale, "common")("none");
  return (
    <Card>
      <CardHeader>
        <Eyebrow>
          {t("stepNumber", { n: number })} · {t("eyebrow.model")}
        </Eyebrow>
        <CardTitle>
          <h2 className="flex flex-wrap items-center gap-2">
            <PassBadge pass={step.pass} t={t} />
            {t(`steps.${step.step}`)} {t(`inputs.${step.input}`)}
          </h2>
        </CardTitle>
        <CardDescription>{t(`verdicts.${step.verdict}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          <span className="font-medium">{t("given")}</span>
          {step.instructionsInInput.length ? places(step.instructionsInInput, t) : none}.
        </p>
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("answered")}</p>
          <ul className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2 font-mono text-xs break-words">
            {step.answer.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
        <p>
          <span className="font-medium">{t("wrote")}</span>
          {step.modelWrote.length ? step.modelWrote.join(", ") : none}
        </p>
        <p>
          <span className="font-medium">{t("checks")}</span>
          {step.checks}
        </p>
        <p className={`rounded-lg border px-3 py-2 ${step.stored.length ? "border-destructive/40 bg-destructive/10" : "border-success/35 bg-success-soft"}`}>
          <span className="font-medium">{t("stored")}</span>
          {step.stored.length ? step.stored.join(", ") : none}
        </p>
        <p className="text-xs text-muted-foreground">{t("calls", { count: step.calls, seconds: step.seconds })}</p>
      </CardContent>
    </Card>
  );
}
