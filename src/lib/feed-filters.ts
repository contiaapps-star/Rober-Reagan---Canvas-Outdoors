import type { ActivityStatus, FeedSort } from '../db/queries.js';

export const FILTER_COOKIE_NAME = 'flowcore_filter_state';

export type DateRange = 'today' | '7d' | '30d' | 'all';

export type FilterState = {
  channel: string; // raw channel value, group alias ('meta'|'google'|'seo'), or '' for all
  status: '' | ActivityStatus;
  competitorId: string;
  range: DateRange;
  sort: FeedSort;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  channel: '',
  status: '',
  competitorId: '',
  range: '7d',
  sort: 'desc',
};

const VALID_CHANNELS = new Set([
  '',
  'website',
  'meta',
  'meta_facebook',
  'meta_instagram',
  'google',
  'google_ads',
  'tiktok',
  'youtube',
  'seo',
  'seo_ranking',
  'seo_backlink',
]);

const VALID_RANGES = new Set<DateRange>(['today', '7d', '30d', 'all']);
const VALID_STATUS = new Set<'' | ActivityStatus>([
  '',
  'new',
  'useful',
  'skip',
]);
const VALID_SORT = new Set<FeedSort>(['asc', 'desc']);

export function expandChannelFilter(
  channel: string | undefined | null,
): string[] | undefined {
  if (!channel || channel === 'all') return undefined;
  switch (channel) {
    case 'meta':
      return ['meta_facebook', 'meta_instagram'];
    case 'google':
      return ['google_ads'];
    case 'seo':
      return ['seo_ranking', 'seo_backlink'];
    case 'website':
    case 'tiktok':
    case 'youtube':
    case 'meta_facebook':
    case 'meta_instagram':
    case 'google_ads':
    case 'seo_ranking':
    case 'seo_backlink':
      return [channel];
    default:
      return undefined;
  }
}

export function rangeToSinceUnix(
  range: DateRange,
  nowUnix: number = Math.floor(Date.now() / 1000),
): number | undefined {
  if (range === 'all') return undefined;
  if (range === 'today') {
    const now = new Date(nowUnix * 1000);
    return Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
    );
  }
  if (range === '7d') return nowUnix - 7 * 86400;
  if (range === '30d') return nowUnix - 30 * 86400;
  return undefined;
}

export function readFilterCookie(rawCookie: string | undefined): FilterState {
  if (!rawCookie) return { ...DEFAULT_FILTER_STATE };
  try {
    const parsed = JSON.parse(decodeURIComponent(rawCookie)) as Record<
      string,
      unknown
    >;
    return normalizeFilterState(parsed);
  } catch {
    return { ...DEFAULT_FILTER_STATE };
  }
}

export function normalizeFilterState(
  source: Record<string, unknown>,
): FilterState {
  const channelRaw = typeof source.channel === 'string' ? source.channel : '';
  const channel = VALID_CHANNELS.has(channelRaw) ? channelRaw : '';

  const statusRaw = typeof source.status === 'string' ? source.status : '';
  const status = (VALID_STATUS.has(statusRaw as '' | ActivityStatus)
    ? statusRaw
    : '') as '' | ActivityStatus;

  const competitorIdRaw =
    typeof source.competitor_id === 'string'
      ? source.competitor_id
      : typeof source.competitorId === 'string'
        ? source.competitorId
        : '';

  const rangeRaw = typeof source.range === 'string' ? source.range : '7d';
  const range = (VALID_RANGES.has(rangeRaw as DateRange)
    ? rangeRaw
    : '7d') as DateRange;

  const sortRaw = typeof source.sort === 'string' ? source.sort : 'desc';
  const sort = (VALID_SORT.has(sortRaw as FeedSort)
    ? sortRaw
    : 'desc') as FeedSort;

  return {
    channel,
    status,
    competitorId: competitorIdRaw,
    range,
    sort,
  };
}

export function parseFilterFromQuery(
  query: Record<string, string | undefined>,
  fallback: FilterState = { ...DEFAULT_FILTER_STATE },
): FilterState {
  const merged: Record<string, unknown> = {
    channel: query.channel ?? fallback.channel,
    status: query.status ?? fallback.status,
    competitor_id: query.competitor_id ?? fallback.competitorId,
    range: query.range ?? fallback.range,
    sort: query.sort ?? fallback.sort,
  };
  return normalizeFilterState(merged);
}

export function serializeFilterCookieValue(state: FilterState): string {
  const minimal: Record<string, string> = {};
  if (state.channel) minimal.channel = state.channel;
  if (state.status) minimal.status = state.status;
  if (state.competitorId) minimal.competitor_id = state.competitorId;
  if (state.range && state.range !== '7d') minimal.range = state.range;
  if (state.sort && state.sort !== 'desc') minimal.sort = state.sort;
  return encodeURIComponent(JSON.stringify(minimal));
}

export function encodeCursor(detectedAt: number, id: string): string {
  return Buffer.from(`${detectedAt}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined | null,
): { detectedAt: number; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [detectedAtStr, ...idParts] = decoded.split('|');
    const id = idParts.join('|');
    const detectedAt = Number(detectedAtStr);
    if (!Number.isFinite(detectedAt) || !id) return undefined;
    return { detectedAt, id };
  } catch {
    return undefined;
  }
}
