import { ClaimBadge } from "@/components/claim-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONFIDENCE_TEXT, fieldHeadingId, formatDate, valueItems, type ClaimRow, type FieldView } from "@/lib/profile-view/claims";
import { defaultVisibility, valueToInput } from "@/lib/profile-view/edit";
import type { EvidenceView } from "@/lib/profile-view/load";
import { STALE_AFTER_DAYS } from "@/lib/profiler/stale";
import { ClaimEditor } from "./claim-editor";
import { EvidenceViewer } from "./evidence-viewer";
import { SuggestionReview } from "./suggestion-review";

/**
 * The eight profile fields (C5). Every field is shown, a missing one as
 * missing. `editable` adds the member's editor and suggestion review (C7).
 */
export function FieldList({
  fields,
  evidence,
  editable = false,
}: {
  fields: FieldView[];
  evidence: Record<string, EvidenceView[]>;
  editable?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {fields.map((view) => (
        <li key={view.field}>
          <FieldCard view={view} evidence={evidence} editable={editable} />
        </li>
      ))}
    </ol>
  );
}

function FieldCard({ view, evidence, editable }: { view: FieldView; evidence: Record<string, EvidenceView[]>; editable: boolean }) {
  const claim = view.claim;
  const value = <ClaimValue field={view.field} claim={claim} />;
  const headingId = fieldHeadingId(view.field);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          {/* tabIndex -1: focus comes back here after a suggestion is accepted or rejected. */}
          <h3 id={headingId} tabIndex={-1} className="outline-none focus-visible:underline">
            {view.label}
          </h3>
        </CardTitle>
        <CardDescription>{view.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ClaimMeta view={view} />
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
        {claim ? <EvidenceViewer quotes={evidence[claim.id] ?? []} /> : null}
        {editable && view.suggestion ? (
          <Suggestion field={view.field} label={view.label} suggestion={view.suggestion} evidence={evidence} headingId={headingId} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Status badge, confidence, date, stale flag and who may see it. */
function ClaimMeta({ view }: { view: FieldView }) {
  const claim = view.claim;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <ClaimBadge status={view.status} />
      {view.confidence ? <span>Confidence: {CONFIDENCE_TEXT[view.confidence]}</span> : null}
      {claim ? (
        <span>
          Updated <time dateTime={claim.updatedAt.toISOString()}>{formatDate(claim.updatedAt)}</time>
        </span>
      ) : null}
      {view.stale ? (
        <Badge variant="warning" title={`Not updated for more than ${STALE_AFTER_DAYS} days. It may be out of date.`}>
          Stale: over {STALE_AFTER_DAYS} days old
        </Badge>
      ) : null}
      {claim?.visibility === "private" ? (
        <Badge variant="outline" title="Only your company sees this value.">
          Private
        </Badge>
      ) : null}
    </div>
  );
}

function ClaimValue({ field, claim }: { field: FieldView["field"]; claim: ClaimRow | null }) {
  const items = valueItems(claim?.value ?? null);
  if (!claim || claim.status === "missing" || !items.length) {
    return (
      <p className="text-muted-foreground">
        {claim ? "The company's public pages do not say this." : "No information on this yet."}
      </p>
    );
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
}: {
  field: FieldView["field"];
  label: string;
  suggestion: ClaimRow;
  evidence: Record<string, EvidenceView[]>;
  headingId: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Suggested update</span>
        <ClaimBadge status={suggestion.status} />
        <span>
          Found <time dateTime={suggestion.updatedAt.toISOString()}>{formatDate(suggestion.updatedAt)}</time> by the weekly
          profile refresh
        </span>
      </div>
      <ClaimValue field={field} claim={suggestion} />
      <EvidenceViewer quotes={evidence[suggestion.id] ?? []} />
      <SuggestionReview claimId={suggestion.id} fieldLabel={label} returnFocusTo={headingId} />
    </div>
  );
}
