import { fetchJson } from '../../lib/http.js';

export const SERPER_URL = 'https://google.serper.dev/search';

export type SerperOrganicResult = {
  position: number;
  link: string;
  title?: string;
  snippet?: string;
};

export type SerperResponse = {
  organic?: SerperOrganicResult[];
  searchParameters?: { q?: string };
};

export type SerperSearchOptions = {
  apiKey: string;
  query: string;
  gl?: string;
  hl?: string;
  num?: number;
};

export async function serperSearch(
  opts: SerperSearchOptions,
): Promise<SerperResponse> {
  if (!opts.apiKey) throw new Error('Serper: missing apiKey');
  return fetchJson<SerperResponse>(SERPER_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': opts.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: opts.query,
      gl: opts.gl ?? 'us',
      hl: opts.hl ?? 'en',
      num: opts.num ?? 100,
    }),
    timeoutMs: 30_000,
  });
}

// Returns the 1-indexed position of the first result whose link's hostname
// matches `domain` (case-insensitive, with/without `www.`). Returns null if
// not found in the top-N results.
export function findDomainPosition(
  results: SerperOrganicResult[] | undefined,
  domain: string,
): number | null {
  if (!results || results.length === 0) return null;
  const target = domain.toLowerCase().replace(/^www\./, '');
  for (const r of results) {
    try {
      const host = new URL(r.link).hostname.toLowerCase().replace(/^www\./, '');
      if (host === target || host.endsWith(`.${target}`)) {
        return r.position;
      }
    } catch {
      // ignore malformed link
    }
  }
  return null;
}
