import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import {
  activities,
  competitorHandles,
  competitors,
  pollRuns,
  type Competitor,
} from '../../src/db/schema.js';
import { runDailyPoll } from '../../src/services/polling-orchestrator.js';
import { APIFY_ACTORS } from '../../src/services/providers/apify.js';
import { startMswServer, withLiveMode } from '../helpers/msw.js';
import { createTestDb } from '../helpers/db.js';

const server = startMswServer();
withLiveMode();

let ctx: ReturnType<typeof createTestDb>;
let competitor: Competitor;

beforeEach(() => {
  ctx = createTestDb();
  const id = randomUUID();
  ctx.db
    .insert(competitors)
    .values({
      id,
      name: 'AquaPoint Drilling Co.',
      domain: 'aquapointdrilling.example',
      category: 'both',
      tier: 'mondo_100m',
    })
    .run();
  for (const ch of ['meta_facebook', 'tiktok', 'youtube', 'google_ads'] as const) {
    ctx.db
      .insert(competitorHandles)
      .values({
        id: randomUUID(),
        competitorId: id,
        channel: ch,
        handle:
          ch === 'youtube'
            ? 'UCaquapoint00001'
            : ch === 'google_ads'
            ? 'AR123456789'
            : 'aquapointdrilling',
        isActive: true,
      })
      .run();
  }
  competitor = ctx.db.select().from(competitors).all()[0]!;
});

afterEach(() => {
  ctx.sqlite.close();
});

const SITEMAP = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://aquapointdrilling.example/blog/april-update</loc></url>
</urlset>`;

const ZENROWS_PAGE = `<html><head><title>April Update</title></head><body><p>Spring deals.</p></body></html>`;

const META_AD = {
  ad_archive_id: 'ad-100',
  page_name: 'AquaPoint',
  page_id: 'page-001',
  publisher_platform: ['facebook'],
  snapshot: {
    title: 'Spring promo',
    body: { text: '10% off in April' },
    cta_text: 'Learn More',
    link_url: 'https://aquapointdrilling.example/promo',
    images: [{ original_image_url: 'https://cdn.example/img.jpg' }],
  },
  start_date: 1714000000,
};

const GOOGLE_AD = {
  advertiser_id: 'AR123456789',
  advertiser_name: 'AquaPoint',
  landing_page_url: 'https://aquapointdrilling.example/lp/promo',
  headline: 'Save big',
  first_shown: '2026-04-20',
  format: 'text',
};

const TIKTOK_VIDEO = {
  id: 'tk-100',
  text: 'New rig',
  createTime: 1714000000,
  playCount: 5000,
  authorMeta: { name: 'aquapointdrilling' },
  videoMeta: { duration: 30, coverUrl: 'https://cdn.example/c.jpg' },
};

const YT_CHANNEL_RESPONSE = {
  items: [
    {
      id: 'UCaquapoint00001',
      contentDetails: { relatedPlaylists: { uploads: 'UU_uploads' } },
    },
  ],
};
const YT_PLAYLIST_RESPONSE = {
  items: [{ contentDetails: { videoId: 'yt-short-100' } }],
};
const YT_VIDEOS_RESPONSE = {
  items: [
    {
      id: 'yt-short-100',
      contentDetails: { duration: 'PT45S' },
      snippet: {
        title: 'Short rig clip',
        publishedAt: '2026-04-22T10:00:00Z',
        channelId: 'UCaquapoint00001',
        thumbnails: {
          high: { url: 'https://i.ytimg.com/yt.jpg', width: 720, height: 1280 },
        },
      },
      statistics: { viewCount: '1000', likeCount: '50' },
    },
  ],
};

function mockAllUpstreams() {
  server.use(
    // Website tier 1: sitemap.
    http.get('https://aquapointdrilling.example/sitemap.xml', () =>
      new HttpResponse(SITEMAP, { status: 200, headers: { 'content-type': 'application/xml' } }),
    ),
    // Catch-all for any RSS/feed paths in case sitemap path was bypassed.
    http.get('https://aquapointdrilling.example/feed', () =>
      new HttpResponse('not found', { status: 404 }),
    ),
    // Page scrape via ZenRows.
    http.get('https://api.zenrows.com/v1/', () =>
      new HttpResponse(ZENROWS_PAGE, { status: 200 }),
    ),
    // Apify Meta.
    http.post(
      `https://api.apify.com/v2/acts/${APIFY_ACTORS.metaAdsLibrary}/run-sync-get-dataset-items`,
      () => HttpResponse.json([META_AD]),
    ),
    // Apify Google Ads.
    http.post(
      `https://api.apify.com/v2/acts/${APIFY_ACTORS.googleAdsTransparency}/run-sync-get-dataset-items`,
      () => HttpResponse.json([GOOGLE_AD]),
    ),
    // Apify TikTok.
    http.post(
      `https://api.apify.com/v2/acts/${APIFY_ACTORS.tiktokScraper}/run-sync-get-dataset-items`,
      () => HttpResponse.json([TIKTOK_VIDEO]),
    ),
    // YouTube Data API.
    http.get('https://www.googleapis.com/youtube/v3/channels', () =>
      HttpResponse.json(YT_CHANNEL_RESPONSE),
    ),
    http.get('https://www.googleapis.com/youtube/v3/playlistItems', () =>
      HttpResponse.json(YT_PLAYLIST_RESPONSE),
    ),
    http.get('https://www.googleapis.com/youtube/v3/videos', () =>
      HttpResponse.json(YT_VIDEOS_RESPONSE),
    ),
  );
}

describe('end-to-end runDailyPoll in live mode', () => {
  it('inserts activities for every channel with all upstreams mocked', async () => {
    mockAllUpstreams();
    const summary = await runDailyPoll({
      db: ctx.db,
      pollerConcurrency: 1,
      // Skip LLM in integration — phase 5 is about pollers, not summaries.
      llmOptions: { apiKey: '' },
    });
    expect(summary.totalInserted).toBeGreaterThan(0);

    const inserted = ctx.db.select().from(activities).all();
    const channels = new Set(inserted.map((a) => a.channel));
    // Expect at least website, meta_facebook, google_ads, tiktok, youtube
    expect(channels.has('website')).toBe(true);
    expect(channels.has('meta_facebook')).toBe(true);
    expect(channels.has('google_ads')).toBe(true);
    expect(channels.has('tiktok')).toBe(true);
    expect(channels.has('youtube')).toBe(true);

    // poll_runs must reflect ok status for all 5 daily pollers.
    const runs = ctx.db.select().from(pollRuns).all();
    expect(runs.length).toBe(5);
    expect(runs.every((r) => r.status === 'ok')).toBe(true);
  });

  it('a 503 on Apify (Meta) does not block website + youtube — those still complete', async () => {
    server.use(
      // Website OK.
      http.get('https://aquapointdrilling.example/sitemap.xml', () =>
        new HttpResponse(SITEMAP, { status: 200 }),
      ),
      http.get('https://aquapointdrilling.example/feed', () =>
        new HttpResponse('not found', { status: 404 }),
      ),
      http.get('https://api.zenrows.com/v1/', () =>
        new HttpResponse(ZENROWS_PAGE, { status: 200 }),
      ),
      // Apify Meta is broken — every retry returns 503.
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.metaAdsLibrary}/run-sync-get-dataset-items`,
        () => new HttpResponse('upstream down', { status: 503 }),
      ),
      // Apify Google Ads OK so we keep things narrow to "1 broken channel".
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.googleAdsTransparency}/run-sync-get-dataset-items`,
        () => HttpResponse.json([GOOGLE_AD]),
      ),
      // Apify TikTok OK.
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.tiktokScraper}/run-sync-get-dataset-items`,
        () => HttpResponse.json([TIKTOK_VIDEO]),
      ),
      // YouTube OK.
      http.get('https://www.googleapis.com/youtube/v3/channels', () =>
        HttpResponse.json(YT_CHANNEL_RESPONSE),
      ),
      http.get('https://www.googleapis.com/youtube/v3/playlistItems', () =>
        HttpResponse.json(YT_PLAYLIST_RESPONSE),
      ),
      http.get('https://www.googleapis.com/youtube/v3/videos', () =>
        HttpResponse.json(YT_VIDEOS_RESPONSE),
      ),
    );

    const summary = await runDailyPoll({
      db: ctx.db,
      pollerConcurrency: 1,
      llmOptions: { apiKey: '' },
    });
    // Website + youtube + google_ads + tiktok still produced items.
    const inserted = ctx.db.select().from(activities).all();
    const channels = new Set(inserted.map((a) => a.channel));
    expect(channels.has('website')).toBe(true);
    expect(channels.has('youtube')).toBe(true);
    expect(channels.has('google_ads')).toBe(true);
    expect(channels.has('tiktok')).toBe(true);
    // Meta is broken — no meta_facebook or meta_instagram activity.
    expect(channels.has('meta_facebook')).toBe(false);
    expect(channels.has('meta_instagram')).toBe(false);

    // The meta poll_run is marked failed; the other 4 are ok.
    const runs = ctx.db.select().from(pollRuns).all();
    const meta = runs.find((r) => r.channel === 'meta');
    expect(meta?.status).toBe('failed');
    expect(meta?.errorMessage).toBeTruthy();
    const others = runs.filter((r) => r.channel !== 'meta');
    expect(others.length).toBe(4);
    expect(others.every((r) => r.status === 'ok')).toBe(true);
    expect(summary.totalInserted).toBeGreaterThan(0);
  });
});
