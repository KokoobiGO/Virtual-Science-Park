"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveClaim, type ProfileActionState } from "./actions";

const initialState: ProfileActionState = { error: null };

/**
 * Inline editor for one profile field (C7). Shows the value (`children`) with
 * an Edit button; editing swaps in a form. Saving stores the member's own
 * claim through the saveClaim server action.
 *
 * The text and the Private box are controlled, so a failed save keeps what the
 * member typed (React resets an uncontrolled form after its action). After a
 * save or Cancel, focus goes back to the Edit button.
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
  const [text, setText] = useState(initialText);
  const [isPrivate, setIsPrivate] = useState(defaultPrivate);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const close = () => {
    returnFocus.current = true;
    setEditing(false);
  };

  const [, action, pending] = useActionState(async (prev: ProfileActionState, formData: FormData) => {
    const result = await saveClaim(prev, formData);
    setError(result.error);
    if (!result.error) {
      setNotice(result.message ?? "");
      close();
    }
    return result;
  }, initialState);

  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  const open = () => {
    setText(initialText);
    setIsPrivate(defaultPrivate);
    setNotice("");
    setError(null);
    setEditing(true);
  };

  const errorId = `${id}-error`;
  const verb = initialText ? "Edit" : "Add";

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="field" value={field} />
          <input type="hidden" name="claimId" value={claimId} />
          <Label htmlFor={`${id}-value`}>{isList ? `${label}, one per line` : label}</Label>
          <textarea
            id={`${id}-value`}
            name="value"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={isList ? Math.min(8, Math.max(3, initialText.split("\n").length + 1)) : 3}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"
            required
            autoFocus
          />
          <Label className="font-normal">
            <input
              type="checkbox"
              name="private"
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              className="size-4 accent-primary"
            />
            Private: only your company sees this value
          </Label>
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {children}
          <div>
            <Button ref={editButton} type="button" variant="outline" size="sm" onClick={open} aria-label={`${verb} ${label}`}>
              {verb}
            </Button>
          </div>
        </>
      )}
      {/* Always in the page, so screen readers hear "Saved." when it changes. */}
      <p role="status" className="text-xs text-muted-foreground empty:hidden">
        {editing ? "" : notice}
      </p>
    </div>
  );
}
