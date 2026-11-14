/**
 * Live data with a recorded fallback (A11, A19).
 *
 * Every collector that calls an outside API keeps a recorded response next to
 * its code. With DEMO_MODE=cached, or when the live call fails, the recorded
 * copy is used and the result says so, so the UI can label it "cached".
 */
import type { SourceState } from "../schemas";

export type Recorded<T> = {
  /** When the copy was taken (ISO date-time). */
  recordedAt: string;
  data: T;
};

export type LiveOrCached<T> = {
  data: T;
  state: Extract<SourceState, "live" | "cached">;
  cachedAt?: string;
  message?: string;
};

export const isCachedMode = () => process.env.DEMO_MODE === "cached";

export async function liveOrCached<T>(live: () => Promise<T>, recorded: Recorded<T>): Promise<LiveOrCached<T>> {
  if (isCachedMode()) {
    return { data: recorded.data, state: "cached", cachedAt: recorded.recordedAt, message: "DEMO_MODE=cached: the recorded copy was used." };
  }
  try {
    return { data: await live(), state: "live" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      data: recorded.data,
      state: "cached",
      cachedAt: recorded.recordedAt,
      message: `The live source failed (${reason.slice(0, 200)}), so the recorded copy was used.`,
    };
  }
}

/** Fetch JSON with a timeout. Throws on a non-2xx answer, so liveOrCached() falls back. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}
