import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-col gap-12 stagger">
      <Summary result={result} t={t} />
      <Hidden result={result} t={t} />
      {result.steps.map((step, i) => (
        <Step key={`${step.step}-${step.input}`} step={step} number={i + 2} t={t} />
      ))}
      {result.notes.length ? (
        <section className="flex flex-col gap-1 text-sm text-muted-foreground">
          <h2 className="font-medium text-foreground">{t("setupTitle")}</h2>
          <ul className="list-disc space-y-1 pl-5">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
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

/** One part of the story: a small overline (so a viewer can follow it in order), a heading, a quiet line, then the content. No box. */
function Part({ overline, title, description, children }: { overline: string; title: ReactNode; description: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{overline}</p>
        <h2 className="flex flex-wrap items-center gap-2 text-heading">{title}</h2>
        <div className="text-sm break-words text-muted-foreground">{description}</div>
      </div>
      {children}
    </section>
  );
}

function Summary({ result, t }: { result: InjectionDemoResult; t: Translator<"injection"> }) {
  const passed = result.steps.filter((s) => s.pass).length;
  // The detector's label is our own fixed text; show it in the reader's language when it is that text.
  const label = result.detector.label === INJECTION_LABEL ? t("detectorLabel") : result.detector.label;
  return (
    <Part
      overline={t("eyebrow.result")}
      title={
        <>
          <PassBadge pass={result.pass} t={t} />
          {t("summaryTitle", { passed, total: result.steps.length })}
        </>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          {/* D20: a recorded run read from a file, not a live one. */}
          <DataStatusLabel kind="cached" date={result.ranAt} locale={t.locale} />
          <span>{t("ran", { date: formatDateTime(result.ranAt, t.locale), model: result.model, company: result.judgedFor })}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-1 text-sm">
        <p>
          <span className="font-medium">{t("labelTitle")}: </span>
          {label ? <span className="text-warning">{label}</span> : <span className="text-destructive">{t("notFlagged")}</span>}
        </p>
        {result.detector.locations.length ? (
          <p className="text-muted-foreground">{t("foundIn", { locations: places(result.detector.locations, t) })}</p>
        ) : null}
      </div>
      <p className="text-sm">{t("lookAt")}</p>
    </Part>
  );
}

function Hidden({ result, t }: { result: InjectionDemoResult; t: Translator<"injection"> }) {
  return (
    <Part
      overline={`${t("stepNumber", { n: 1 })} · ${t("eyebrow.trap")}`}
      title={t("hiddenTitle")}
      description={t("hiddenIntro", { method: result.extractor.method, chars: result.extractor.chars })}
    >
      <ul className="flex flex-col gap-4">
        {result.extractor.kept.map((item) => (
          <li key={item.where} className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t(`locations.${item.where}`)}</span>
              <Badge variant={item.kept ? "warning" : "outline"}>{item.kept ? t("kept") : t("dropped")}</Badge>
            </div>
            <p className="text-muted-foreground">{item.how}</p>
            <blockquote className="border-l-2 pl-3 break-words italic">{item.text}</blockquote>
          </li>
        ))}
      </ul>
    </Part>
  );
}

function Step({ step, number, t }: { step: InjectionDemoStep; number: number; t: Translator<"injection"> }) {
  const none = createTranslator(t.locale, "common")("none");
  return (
    <Part
      overline={`${t("stepNumber", { n: number })} · ${t("eyebrow.model")}`}
      title={
        <>
          <PassBadge pass={step.pass} t={t} />
          {t(`steps.${step.step}`)} {t(`inputs.${step.input}`)}
        </>
      }
      description={t(`verdicts.${step.verdict}`)}
    >
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <span className="font-medium">{t("given")}</span>
          {step.instructionsInInput.length ? places(step.instructionsInInput, t) : none}.
        </p>
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("answered")}</p>
          <ul className="flex flex-col gap-0.5 border-l-2 pl-3 font-mono text-xs break-words text-muted-foreground">
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
        {/* The line the "what to look at" sentence points at: red when something got through, green when nothing did. */}
        <p className={step.stored.length ? "text-destructive" : "text-success"}>
          <span className="font-medium">{t("stored")}</span>
          {step.stored.length ? step.stored.join(", ") : none}
        </p>
        <p className="text-xs text-muted-foreground">{t("calls", { count: step.calls, seconds: step.seconds })}</p>
      </div>
    </Part>
  );
}
