import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import {
  competitorHandles,
  competitors,
  type Competitor,
} from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { youtubePoller } from '../../src/pollers/youtube.js';
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
  ctx.db
    .insert(competitorHandles)
    .values({
      id: randomUUID(),
      competitorId: id,
      channel: 'youtube',
      handle: 'UCaquapoint00001',
      isActive: true,
    })
    .run();
  competitor = ctx.db.select().from(competitors).all()[0]!;
});

afterEach(() => {
  ctx.sqlite.close();
});

function makeCtx(): PollerContext {
  return {
    competitorId: competitor.id,
    competitor: { ...competitor, id: competitor.id },
    db: ctx.db,
  };
}

const UPLOADS_PLAYLIST_ID = 'UU_aquapoint_uploads';

function setupYouTubeMocks(videos: Array<{
  id: string;
  durationIso: string;
  thumbW: number;
  thumbH: number;
}>) {
  server.use(
    http.get('https://www.googleapis.com/youtube/v3/channels', () =>
      HttpResponse.json({
        items: [
          {
            id: 'UCaquapoint00001',
            contentDetails: { relatedPlaylists: { uploads: UPLOADS_PLAYLIST_ID } },
          },
        ],
      }),
    ),
    http.get('https://www.googleapis.com/youtube/v3/playlistItems', () =>
      HttpResponse.json({
        items: videos.map((v) => ({ contentDetails: { videoId: v.id } })),
      }),
    ),
    http.get('https://www.googleapis.com/youtube/v3/videos', () =>
      HttpResponse.json({
        items: videos.map((v) => ({
          id: v.id,
          contentDetails: { duration: v.durationIso },
          snippet: {
            title: `Video ${v.id}`,
            publishedAt: '2026-04-20T10:00:00Z',
            channelId: 'UCaquapoint00001',
            thumbnails: {
              high: {
                url: `https://i.ytimg.com/${v.id}.jpg`,
                width: v.thumbW,
                height: v.thumbH,
              },
            },
          },
          statistics: { viewCount: '1000', likeCount: '50' },
        })),
      }),
    ),
  );
}

describe('youtube live poller — Shorts filter', () => {
  it('emits a 45s vertical video, drops a 120s video, drops a 45s landscape video', async () => {
    setupYouTubeMocks([
      { id: 'short-vertical', durationIso: 'PT45S', thumbW: 720, thumbH: 1280 },
      { id: 'long-vertical', durationIso: 'PT2M', thumbW: 720, thumbH: 1280 },
      { id: 'short-landscape', durationIso: 'PT45S', thumbW: 1280, thumbH: 720 },
    ]);

    const result = await youtubePoller.poll(makeCtx());
    expect(result.items.length).toBe(1);
    const it = result.items[0]!;
    expect((it.payload as Record<string, unknown>).video_id).toBe('short-vertical');
    expect((it.payload as Record<string, unknown>).duration_s).toBe(45);
  });

  it('parses ISO 8601 durations (PT1M30S = 90s) — drops Shorts >60s', async () => {
    setupYouTubeMocks([
      { id: 'borderline', durationIso: 'PT1M30S', thumbW: 720, thumbH: 1280 },
      { id: 'sharp-edge', durationIso: 'PT1M', thumbW: 720, thumbH: 1280 },
    ]);
    const result = await youtubePoller.poll(makeCtx());
    expect(result.items.map((i) => (i.payload as Record<string, unknown>).video_id)).toEqual([
      'sharp-edge',
    ]);
  });
});
