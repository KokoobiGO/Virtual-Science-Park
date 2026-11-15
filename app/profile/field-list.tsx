import { Lock } from "lucide-react";
import { ClaimBadge } from "@/components/claim-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { fieldHeadingId, formatDate, valueItems, type ClaimRow, type FieldView } from "@/lib/profile-view/claims";
import { defaultVisibility, valueToInput } from "@/lib/profile-view/edit";
import type { EvidenceView } from "@/lib/profile-view/load";
import { STALE_AFTER_DAYS } from "@/lib/profiler/stale";
import { ClaimEditor } from "./claim-editor";
import { EvidenceViewer } from "./evidence-viewer";
import { SuggestionReview } from "./suggestion-review";

/**
 * The eight profile fields (C5). Every field is shown, a missing one as
 * missing. `editable` adds the member's editor and suggestion review (C7).
 * The words are in the reader's language (C19); the values are shown as
 * stored, and the quotes in the page's own language.
 */
export function FieldList({
  fields,
  evidence,
  editable = false,
  locale = DEFAULT_LOCALE,
}: {
  fields: FieldView[];
  evidence: Record<string, EvidenceView[]>;
  editable?: boolean;
  locale?: Locale;
}) {
  const usualDay = mostCommonDay(fields, locale);
  return (
    <ol className="stagger grid gap-3 md:grid-cols-2">
      {fields.map((view) => (
        // The summary is prose, so it gets the full width; the lists sit two by two.
        <li key={view.field} className={view.field === "summary" ? "md:col-span-2" : undefined}>
          <FieldCard view={view} evidence={evidence} editable={editable} usualDay={usualDay} locale={locale} />
        </li>
      ))}
    </ol>
  );
}

/** The day most fields were last updated. Only a field updated on another day shows its date, so the list does not repeat one date eight times. */
function mostCommonDay(fields: FieldView[], locale: Locale): string | null {
  const counts = new Map<string, number>();
  for (const view of fields) {
    if (!view.claim) continue;
    const day = formatDate(view.claim.updatedAt, locale);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [day, n] of counts) if (best === null || n > counts.get(best)!) best = day;
  return best;
}

function FieldCard({
  view,
  evidence,
  editable,
  usualDay,
  locale,
}: {
  view: FieldView;
  evidence: Record<string, EvidenceView[]>;
  editable: boolean;
  usualDay: string | null;
  locale: Locale;
}) {
  const claim = view.claim;
  const value = <ClaimValue field={view.field} claim={claim} locale={locale} />;
  const headingId = fieldHeadingId(view.field);

  return (
    <Card size="sm" className="h-full gap-3 px-1 py-4">
      <CardHeader className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <CardTitle>
          {/* tabIndex -1: focus comes back here after a suggestion is accepted or rejected. */}
          <h3 id={headingId} tabIndex={-1} title={view.hint} className="text-base font-semibold outline-none focus-visible:underline">
            {view.label}
          </h3>
        </CardTitle>
        <ClaimMeta view={view} usualDay={usualDay} locale={locale} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {editable ? (
          <ClaimEditor
            field={view.field}
            label={view.label}
            claimId={claim?.id ?? ""}
            initialText={claim && claim.status !== "missing" ? valueToInput(claim.value) : ""}
            isList={view.field !== "summary"}
            defaultPrivate={defaultVisibility(claim) === "private"}
          >
            {value}
          </ClaimEditor>
        ) : (
          value
        )}
        {claim ? <EvidenceViewer quotes={evidence[claim.id] ?? []} locale={locale} /> : null}
        {editable && view.suggestion ? (
          <Suggestion
            field={view.field}
            label={view.label}
            suggestion={view.suggestion}
            evidence={evidence}
            headingId={headingId}
            locale={locale}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Status badge, then only what is out of the ordinary: a confidence below
 * high, a date other than the usual one, a stale flag, who may see it.
 */
function ClaimMeta({ view, usualDay, locale }: { view: FieldView; usualDay: string | null; locale: Locale }) {
  const t = createTranslator(locale, "profile");
  const claim = view.claim;
  const day = claim ? formatDate(claim.updatedAt, locale) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <ClaimBadge status={view.status} locale={locale} />
      {view.confidence && view.confidence !== "high" ? (
        <span>{t("confidence", { level: t(`confidenceLevels.${view.confidence}`) })}</span>
      ) : null}
      {claim && day !== usualDay ? (
        <span>{t.rich("updated", { date: <time dateTime={claim.updatedAt.toISOString()}>{day}</time> })}</span>
      ) : null}
      {view.stale ? (
        <Badge variant="warning" title={t("staleTitle", { days: STALE_AFTER_DAYS })}>
          {t("stale", { days: STALE_AFTER_DAYS })}
        </Badge>
      ) : null}
      {claim?.visibility === "private" ? (
        <Badge variant="outline" title={t("privateTitle")}>
          <Lock aria-hidden data-icon="inline-start" />
          {t("private")}
        </Badge>
      ) : null}
    </div>
  );
}

function ClaimValue({ field, claim, locale }: { field: FieldView["field"]; claim: ClaimRow | null; locale: Locale }) {
  const items = valueItems(claim?.value ?? null);
  if (!claim || claim.status === "missing" || !items.length) {
    const t = createTranslator(locale, "profile");
    return <p className="text-muted-foreground">{claim ? t("valueMissing") : t("valueNone")}</p>;
  }
  if (field === "summary") return <p className="leading-relaxed break-words">{items[0]}</p>;
  return (
    <ul className="list-disc space-y-0.5 pl-5 break-words">
      {items.map((item, i) => (
        <li key={`${i}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

/** A suggested update from the weekly profile refresh, waiting for the member. */
function Suggestion({
  field,
  label,
  suggestion,
  evidence,
  headingId,
  locale,
}: {
  field: FieldView["field"];
  label: string;
  suggestion: ClaimRow;
  evidence: Record<string, EvidenceView[]>;
  headingId: string;
  locale: Locale;
}) {
  const t = createTranslator(locale, "profile");
  return (
    <div className="flex animate-rise flex-col gap-2 border-l-2 border-primary/60 pl-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("suggestion.title")}</span>
        <ClaimBadge status={suggestion.status} locale={locale} />
        <span>
          {t.rich("suggestion.found", {
            date: <time dateTime={suggestion.updatedAt.toISOString()}>{formatDate(suggestion.updatedAt, locale)}</time>,
          })}
        </span>
      </div>
      <ClaimValue field={field} claim={suggestion} locale={locale} />
      <EvidenceViewer quotes={evidence[suggestion.id] ?? []} locale={locale} />
      <SuggestionReview claimId={suggestion.id} fieldLabel={label} returnFocusTo={headingId} />
    </div>
  );
}
