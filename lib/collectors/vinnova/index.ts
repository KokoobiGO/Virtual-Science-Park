/**
 * Vinnova collector (A9): open and upcoming application rounds from Vinnova's
 * open data API (https://data.vinnova.se/api), joined with their calls.
 *
 * The API's date in the path means "changed after this date", not "open
 * after". A six-month window keeps the answer near 8 s (the full history takes
 * about 100 s). A round that is still open but has not changed in six months
 * would fall outside it, so every round vinnova.se lists is also fetched by its
 * id when the window missed it. vinnova.se's own search gives each round's page.
 */
import { fetchJson, liveOrCached, type Recorded } from "../cache";
import type { Collector } from "../types";
import { isOpenRound, parseVinnova, type VinnovaCall, type VinnovaData, type VinnovaPage, type VinnovaRound } from "./parse";
import recordedJson from "./recorded.json";

const API = "https://data.vinnova.se/api";
const SEARCH_URL = "https://www.vinnova.se/sok-finansiering/hitta-finansiering/Search/";
const WINDOW_DAYS = 183;

const recorded = recordedJson as unknown as Recorded<VinnovaData>;

/** Read the live sources. Exported so a recording can be taken with the same code. */
export async function fetchVinnova(now = new Date()): Promise<VinnovaData> {
  const from = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [rounds, calls, pages] = await Promise.all([
    fetchJson<VinnovaRound[]>(`${API}/ansokningsomgangar/${from}`),
    fetchJson<VinnovaCall[]>(`${API}/utlysningar/${from}`),
    fetchPages(),
  ]);

  const haveRound = new Set(rounds.map((round) => round.Diarienummer));
  const listed = pages.map((page) => page.UtlysningSearchFindHit?.AoDiarienummer ?? "");
  rounds.push(...(await fetchByIds<VinnovaRound>("ansokningsomgangar", listed.filter((id) => id && !haveRound.has(id)))));

  const haveCall = new Set(calls.map((call) => call.Diarienummer));
  const needed = rounds.filter((round) => isOpenRound(round, now)).map((round) => round.DiarienummerUtlysning ?? "");
  calls.push(...(await fetchByIds<VinnovaCall>("utlysningar", needed.filter((id) => id && !haveCall.has(id)))));

  return { rounds, calls, pages };
}

/** Each id once; the API answers a list even for one id. */
async function fetchByIds<T>(endpoint: string, ids: string[]): Promise<T[]> {
  const lists = await Promise.all([...new Set(ids)].map((id) => fetchJson<T[]>(`${API}/${endpoint}/${id}`)));
  return lists.flat();
}

/** The page list only improves links, so a failure here gives an empty list instead of the cached copy. */
async function fetchPages(): Promise<VinnovaPage[]> {
  try {
    const body = await fetchJson<{ FindHitList?: VinnovaPage[] }>(SEARCH_URL, { headers: { Accept: "application/json" } });
    return body.FindHitList ?? [];
  } catch {
    return [];
  }
}

export const vinnovaCollector: Collector = {
  source: "vinnova",
  label: "Vinnova",
  async collect() {
    const result = await liveOrCached(() => fetchVinnova(), recorded);
    const noPages = result.data.pages.length === 0 ? "vinnova.se's list of offers could not be read, so items link to the find-funding page." : undefined;
    return {
      items: parseVinnova(result.data, new Date()),
      state: result.state,
      cachedAt: result.cachedAt,
      message: result.message ?? noPages,
    };
  },
};
