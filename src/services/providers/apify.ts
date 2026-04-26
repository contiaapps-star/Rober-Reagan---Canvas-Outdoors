import { fetchWithRetry } from '../../lib/http.js';

export const APIFY_BASE = 'https://api.apify.com/v2';

// Apify actor names we depend on. Centralized so docs/api-providers.md stays
// in sync with code.
export const APIFY_ACTORS = {
  metaAdsLibrary: 'apify~facebook-ads-library-scraper',
  googleAdsTransparency: 'apify~google-ads-transparency-scraper',
  tiktokScraper: 'apify~tiktok-scraper',
  tiktokSearchScraper: 'apify~tiktok-search-scraper',
} as const;

export type ApifyRunOptions<T> = {
  apiToken: string;
  actor: string;
  input: T;
  timeoutMs?: number;
};

// run-sync-get-dataset-items is the Apify endpoint that runs the actor and
// returns the dataset rows in a single response. It blocks until the run
// finishes; we use a generous timeout (default 60s).
export async function apifyRunSync<TInput, TOutput>(
  opts: ApifyRunOptions<TInput>,
): Promise<TOutput[]> {
  if (!opts.apiToken) throw new Error('Apify: missing apiToken');
  const url = `${APIFY_BASE}/acts/${opts.actor}/run-sync-get-dataset-items`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts.input),
    timeoutMs: opts.timeoutMs ?? 60_000,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Apify ${opts.actor} HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) {
    throw new Error(
      `Apify ${opts.actor} returned non-array body — got ${typeof json}`,
    );
  }
  return json as TOutput[];
}
