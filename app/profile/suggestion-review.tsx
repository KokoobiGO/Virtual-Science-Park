"use client";

import { useActionState, useId, type MouseEvent } from "react";
import { announce } from "@/components/announcer";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { reviewSuggestion, type ProfileActionState } from "./actions";

const initialState: ProfileActionState = { error: null };

/**
 * Accept or reject one suggested claim (C7). The pressed button's value says
 * which. On success the suggestion leaves the page, so focus goes to the
 * field's heading (`returnFocusTo`) and the result is announced. The buttons
 * are never disabled, so focus stays on the pressed one while it saves.
 */
export function SuggestionReview({
  claimId,
  fieldLabel,
  returnFocusTo,
}: {
  claimId: string;
  /** The field's name, for the buttons' accessible names ("Accept the suggested Markets"). */
  fieldLabel: string;
  returnFocusTo?: string;
}) {
  const errorId = useId();
  const t = useT("profile");
  const [state, action, pending] = useActionState(async (prev: ProfileActionState, formData: FormData) => {
    const result = await reviewSuggestion(prev, formData);
    if (!result.error) {
      if (returnFocusTo) document.getElementById(returnFocusTo)?.focus();
      if (result.message) announce(result.message);
    }
    return result;
  }, initialState);
  // One decision at a time: a second press while saving does nothing.
  const guard = (event: MouseEvent) => {
    if (pending) event.preventDefault();
  };

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="claimId" value={claimId} />
      <Button
        type="submit"
        name="decision"
        value="accept"
        size="sm"
        aria-disabled={pending || undefined}
        aria-label={t("suggestion.acceptLabel", { field: fieldLabel })}
        className="aria-disabled:opacity-60"
        aria-describedby={state.error ? errorId : undefined}
        onClick={guard}
      >
        {t("suggestion.accept")}
      </Button>
      <Button
        type="submit"
        name="decision"
        value="reject"
        variant="outline"
        size="sm"
        aria-disabled={pending || undefined}
        aria-label={t("suggestion.rejectLabel", { field: fieldLabel })}
        className="aria-disabled:opacity-60"
        onClick={guard}
      >
        {t("suggestion.reject")}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {pending ? t("suggestion.saving") : ""}
      </span>
      {state.error ? (
        <p id={errorId} role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
