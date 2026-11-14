"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveClaim, type ProfileActionState } from "./actions";

const initialState: ProfileActionState = { error: null };

/**
 * Inline editor for one profile field (C7). Shows the value (`children`) with
 * an Edit button; editing swaps in a form. Saving stores the member's own
 * claim through the saveClaim server action.
 */
export function ClaimEditor({
  field,
  label,
  claimId,
  initialText,
  isList,
  defaultPrivate,
  children,
}: {
  field: string;
  label: string;
  /** The claim the member sees now; empty when the field has no claim. */
  claimId: string;
  initialText: string;
  isList: boolean;
  defaultPrivate: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ProfileActionState, formData: FormData) => {
    const result = await saveClaim(prev, formData);
    if (!result.error) setEditing(false);
    return result;
  }, initialState);

  if (!editing) {
    return (
      <div className="flex flex-col gap-2">
        {children}
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {initialText ? "Edit" : "Add"}
          </Button>
          {state.message ? (
            <span role="status" className="text-xs text-muted-foreground">
              {state.message}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="claimId" value={claimId} />
      <Label htmlFor={`${id}-value`}>{isList ? `${label}, one per line` : label}</Label>
      <textarea
        id={`${id}-value`}
        name="value"
        defaultValue={initialText}
        rows={isList ? Math.min(8, Math.max(3, initialText.split("\n").length + 1)) : 3}
        className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        required
        autoFocus
      />
      <Label className="font-normal">
        <input type="checkbox" name="private" defaultChecked={defaultPrivate} className="size-4 accent-primary" />
        Private: only your company sees this value
      </Label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
