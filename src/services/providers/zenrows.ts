import { fetchWithRetry, type FetchWithRetryOptions } from '../../lib/http.js';

export const ZENROWS_BASE = 'https://api.zenrows.com/v1/';

export type ZenrowsScrapeOptions = {
  apiKey: string;
  url: string;
  jsRender?: boolean;
  premiumProxy?: boolean;
  timeoutMs?: number;
  fetchOpts?: FetchWithRetryOptions;
};

export type ZenrowsResponse = {
  status: number;
  text: string;
};

// ZenRows is a passthrough proxy. We GET https://api.zenrows.com/v1/ with
// `apikey`, `url`, and optional `js_render`/`premium_proxy` query params, and
// it returns the upstream body verbatim with the upstream status (or a 4xx if
// our credentials are bad).
export async function zenrowsScrape(
  opts: ZenrowsScrapeOptions,
): Promise<ZenrowsResponse> {
  if (!opts.apiKey) throw new Error('ZenRows: missing apiKey');
  const params = new URLSearchParams({
    apikey: opts.apiKey,
    url: opts.url,
  });
  if (opts.jsRender ?? true) params.set('js_render', 'true');
  if (opts.premiumProxy ?? true) params.set('premium_proxy', 'true');
  const finalUrl = `${ZENROWS_BASE}?${params.toString()}`;
  const res = await fetchWithRetry(finalUrl, {
    method: 'GET',
    timeoutMs: opts.timeoutMs ?? 30_000,
    ...opts.fetchOpts,
  });
  const text = await res.text();
  return { status: res.status, text };
}
