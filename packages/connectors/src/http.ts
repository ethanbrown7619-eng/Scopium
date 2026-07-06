/**
 * Polite HTTP layer shared by all scraping connectors. Enforces a single
 * honest User-Agent, a per-domain minimum interval between requests, and
 * bounded retry with backoff. Never disable this for "speed" — it's what
 * keeps Scopium a good citizen against public NZ registers.
 */

const USER_AGENT =
  "ScopiumBot/0.1 (+https://scopium.app; NZ public-register due-diligence; contact: ethanbrown7619@gmail.com)";

const lastHit = new Map<string, number>();

const domainOf = (url: string): string => {
  try { return new URL(url).host; } catch { return url; }
};

export type PoliteFetchOptions = {
  /** Minimum ms between requests to the same host. Default 1000 (≈1 req/sec). */
  minIntervalMs?: number;
  /** Max retries on 429/5xx. Default 3. */
  retries?: number;
  headers?: Record<string, string>;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Injected clock for tests. Returns ms. */
  now?: () => number;
  /** Injected sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const politeFetch = async (url: string, opts: PoliteFetchOptions = {}): Promise<Response> => {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? defaultSleep;
  const minInterval = opts.minIntervalMs ?? 1000;
  const retries = opts.retries ?? 3;
  const host = domainOf(url);

  const since = now() - (lastHit.get(host) ?? 0);
  if (since < minInterval) await sleep(minInterval - since);

  let attempt = 0;
  while (true) {
    lastHit.set(host, now());
    const res = await f(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.9", ...opts.headers },
    });
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= retries) return res;
    await sleep(minInterval * Math.pow(2, attempt));
    attempt++;
  }
};
