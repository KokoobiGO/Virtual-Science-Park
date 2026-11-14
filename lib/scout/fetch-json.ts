/**
 * One JSON answer from an outside search API (B1): the funders' own search
 * endpoints and the keyed web search services.
 *
 * The repo's page fetcher (lib/fetcher/fetch-page.ts) only takes HTML pages by
 * GET, and these APIs answer JSON, some only to a POST. This is its twin for
 * JSON, with the same guards: public http(s) addresses only (publicHttpUrl),
 * the same user agent, a time limit and a size limit. Redirects are not
 * followed: an API that redirects has changed, and the answer counts as failed.
 */
import { FetchPageError, publicHttpUrl, USER_AGENT } from "../fetcher/fetch-page";

/** Per request. A search step runs the store, the live sources and the web in parallel and must stay well under 30 s. */
export const API_TIMEOUT_MS = 8_000;
const MAX_BYTES = 5 * 1024 * 1024;

export type ApiRequest = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | FormData | URLSearchParams;
};

/** How a search source fetches JSON; tests pass their own. */
export type FetchJson = <T>(request: ApiRequest, timeoutMs?: number) => Promise<T>;

export const fetchApiJson: FetchJson = async <T>(request: ApiRequest, timeoutMs = API_TIMEOUT_MS): Promise<T> => {
  const url = publicHttpUrl(request.url);
  const signal = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: request.method ?? "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...request.headers },
      body: request.body,
      redirect: "manual",
      signal,
    });
  } catch (error) {
    const reason = signal.aborted ? `no answer in ${timeoutMs / 1000} s` : ((error as Error).cause as Error)?.message || (error as Error).message;
    throw new FetchPageError(`Could not reach ${url.host}: ${reason}`, 503);
  }
  if (!res.ok) throw new FetchPageError(`${url.host} answered ${res.status}`, res.status);
  if (Number(res.headers.get("content-length")) > MAX_BYTES) throw new FetchPageError(`${url.host} answered more than ${MAX_BYTES / 1024 / 1024} MB`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new FetchPageError(`${url.host} answered more than ${MAX_BYTES / 1024 / 1024} MB`);
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(bytes)) as T;
  } catch {
    throw new FetchPageError(`${url.host} did not answer JSON`);
  }
};
