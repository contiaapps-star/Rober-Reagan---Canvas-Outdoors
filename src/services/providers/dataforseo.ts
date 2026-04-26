import { fetchJson } from '../../lib/http.js';

export const DATAFORSEO_BACKLINKS_URL =
  'https://api.dataforseo.com/v3/backlinks/backlinks/live';

export type DataForSeoBacklinkItem = {
  domain_from?: string;
  url_from?: string;
  url_to?: string;
  rank?: number;
  domain_from_rank?: number;
  anchor?: string;
  first_seen?: string;
  last_seen?: string;
  is_new?: boolean;
};

export type DataForSeoTaskResult = {
  total_count?: number;
  items?: DataForSeoBacklinkItem[];
};

export type DataForSeoTask = {
  status_code?: number;
  status_message?: string;
  result?: DataForSeoTaskResult[];
};

export type DataForSeoBacklinksResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: DataForSeoTask[];
};

export type DataForSeoBacklinksOptions = {
  login: string;
  password: string;
  target: string;
  limit?: number;
  // ISO date string YYYY-MM-DD; only backlinks first_seen >= this date.
  firstSeenIso?: string;
};

function basicAuthHeader(login: string, password: string): string {
  const token = Buffer.from(`${login}:${password}`).toString('base64');
  return `Basic ${token}`;
}

export async function dataForSeoBacklinks(
  opts: DataForSeoBacklinksOptions,
): Promise<DataForSeoBacklinksResponse> {
  if (!opts.login || !opts.password) {
    throw new Error('DataForSEO: missing login/password');
  }
  const filters: unknown[] = [];
  if (opts.firstSeenIso) {
    filters.push(['first_seen', '>', opts.firstSeenIso]);
  }
  const body = [
    {
      target: opts.target,
      mode: 'one_per_domain',
      limit: opts.limit ?? 100,
      order_by: ['rank,desc'],
      ...(filters.length > 0 ? { filters } : {}),
    },
  ];
  return fetchJson<DataForSeoBacklinksResponse>(DATAFORSEO_BACKLINKS_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(opts.login, opts.password),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });
}

export function extractBacklinkItems(
  response: DataForSeoBacklinksResponse,
): DataForSeoBacklinkItem[] {
  const task = response.tasks?.[0];
  const result = task?.result?.[0];
  return result?.items ?? [];
}
