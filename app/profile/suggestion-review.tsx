"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { reviewSuggestion, type ProfileActionState } from "./actions";

const initialState: ProfileActionState = { error: null };

/** Accept or reject one suggested claim (C7). The pressed button's value says which. */
export function SuggestionReview({ claimId }: { claimId: string }) {
  const [state, action, pending] = useActionState(reviewSuggestion, initialState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="claimId" value={claimId} />
      <Button type="submit" name="decision" value="accept" size="sm" disabled={pending}>
        Accept
      </Button>
      <Button type="submit" name="decision" value="reject" variant="outline" size="sm" disabled={pending}>
        Reject
      </Button>
      {pending ? <span className="text-xs text-muted-foreground">Saving{"…"}</span> : null}
      {state.error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
