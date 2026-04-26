import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { activities } from '../db/schema.js';

export type DedupeChannel =
  | 'website'
  | 'meta_facebook'
  | 'meta_instagram'
  | 'google_ads'
  | 'tiktok'
  | 'youtube'
  | 'seo_ranking'
  | 'seo_backlink';

// ─── Per-channel payload shapes (only the fields needed for dedupe) ─────────
export type WebsitePayload = {
  competitor_id: string;
  url: string;
};

export type MetaPayload = {
  advertiser_id: string;
  image_url: string;
  headline: string;
  cta: string;
  landing_url: string;
};

export type GoogleAdsPayload = {
  advertiser_id: string;
  landing_page_url: string;
};

export type TikTokPayload = {
  handle: string;
  aweme_id: string;
};

export type YouTubePayload = {
  channel_id: string;
  video_id: string;
};

export type SeoRankingPayload = {
  competitor_id: string;
  keyword: string;
  // ISO week tag, e.g. "2026-W17". When omitted we derive it from `detected_at`.
  week_iso?: string;
  detected_at?: number; // unix seconds; only used to derive week_iso
};

export type SeoBacklinkPayload = {
  competitor_id: string;
  referring_domain: string;
};

export type DedupePayload =
  | WebsitePayload
  | MetaPayload
  | GoogleAdsPayload
  | TikTokPayload
  | YouTubePayload
  | SeoRankingPayload
  | SeoBacklinkPayload;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Canonicalize: lowercase host+path, drop trailing slash on path, drop empty
// query string, leave non-empty query string as-is. If the input is not a
// well-formed URL, we just lowercase + trim.
export function canonicalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    const protocol = u.protocol.toLowerCase();
    const host = u.hostname.toLowerCase();
    const port = u.port && u.port !== '' ? `:${u.port}` : '';
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const query = u.search === '' ? '' : u.search;
    return `${protocol}//${host}${port}${path}${query}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

// ISO week — yields "YYYY-Www" using the ISO 8601 week-numbering year.
export function isoWeekFromUnix(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  // Copy date and set to nearest Thursday (ISO-week trick).
  const tmp = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = tmp.getUTCDay() || 7; // Sun → 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(tmp.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((tmp.getTime() - yearStart) / 86400000 + 1) / 7);
  const wk = String(week).padStart(2, '0');
  return `${tmp.getUTCFullYear()}-W${wk}`;
}

export function computeDedupeHash(
  channel: DedupeChannel,
  payload: DedupePayload,
): string {
  switch (channel) {
    case 'website': {
      const p = payload as WebsitePayload;
      const url = canonicalizeUrl(p.url);
      return sha256(`${p.competitor_id}:${url}`);
    }
    case 'meta_facebook':
    case 'meta_instagram': {
      const p = payload as MetaPayload;
      return sha256(
        [p.advertiser_id, p.image_url, p.headline, p.cta, p.landing_url].join(':'),
      );
    }
    case 'google_ads': {
      const p = payload as GoogleAdsPayload;
      const url = canonicalizeUrl(p.landing_page_url);
      return sha256(`${p.advertiser_id}:${url}`);
    }
    case 'tiktok': {
      const p = payload as TikTokPayload;
      return sha256(`${p.handle}:${p.aweme_id}`);
    }
    case 'youtube': {
      const p = payload as YouTubePayload;
      return sha256(`${p.channel_id}:${p.video_id}`);
    }
    case 'seo_ranking': {
      const p = payload as SeoRankingPayload;
      const week =
        p.week_iso ??
        isoWeekFromUnix(p.detected_at ?? Math.floor(Date.now() / 1000));
      return sha256(`${p.competitor_id}:${p.keyword}:${week}`);
    }
    case 'seo_backlink': {
      const p = payload as SeoBacklinkPayload;
      return sha256(`${p.competitor_id}:${p.referring_domain.toLowerCase()}`);
    }
  }
}

export function existsByHash(db: Db, hash: string): boolean {
  const row = db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.dedupeHash, hash))
    .get();
  return Boolean(row);
}
