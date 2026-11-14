import { cn } from "cn";
import type { ReactNode } from "react";

/** A grey placeholder block for a loading state. Decorative: the wrapping LoadingState says what is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/**
 * A Suspense fallback (C20): skeleton blocks shaped like the content, and one
 * sentence for screen readers saying what is loading.
 */
export function LoadingState({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-4", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A list of rows: the company list, the handoffs, the check results. */
export function ListSkeleton({ label, rows = 5, rowClassName = "h-12" }: { label: string; rows?: number; rowClassName?: string }) {
  return (
    <LoadingState label={label}>
      <div className="flex flex-col divide-y rounded-xl border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="px-4 py-3">
            <Skeleton className={rowClassName} />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}

/** A company profile: the header, then one card per field. */
export function ProfileSkeleton({ label = "Loading the profile…" }: { label?: string }) {
  return (
    <LoadingState label={label} className="gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
            <Skeleton className="h-12" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}
