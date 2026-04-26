import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import {
  competitorHandles,
  competitors,
  inspirationSources,
  type Competitor,
} from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { tiktokPoller } from '../../src/pollers/tiktok.js';
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
  ctx.db
    .insert(competitorHandles)
    .values({
      id: randomUUID(),
      competitorId: id,
      channel: 'tiktok',
      handle: 'aquapointdrilling',
      isActive: true,
    })
    .run();
  ctx.db
    .insert(inspirationSources)
    .values({
      id: randomUUID(),
      kind: 'keyword_search',
      value: 'wellpump',
      channel: 'tiktok',
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

const HANDLE_VIDEO = {
  id: 'aweme-handle-1',
  text: 'New rig in action',
  createTime: 1714000000,
  playCount: 5000,
  diggCount: 250,
  authorMeta: { name: 'aquapointdrilling' },
  videoMeta: { duration: 30, coverUrl: 'https://cdn.example/handle.jpg' },
  webVideoUrl: 'https://www.tiktok.com/@aquapointdrilling/video/aweme-handle-1',
};

const SEARCH_VIDEO = {
  aweme_id: 'aweme-search-1',
  desc: 'how to fix a well pump #wellpump',
  create_time: 1714050000,
  playCount: 12000,
  authorMeta: { name: 'someinfluencer' },
  videoMeta: { duration: 50, coverUrl: 'https://cdn.example/search.jpg' },
};

describe('tiktok live poller — dual actor wiring', () => {
  it('calls both the handle scraper and the search scraper as separate runs', async () => {
    const calls: { actor: string; body: unknown }[] = [];
    server.use(
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.tiktokScraper}/run-sync-get-dataset-items`,
        async ({ request }) => {
          calls.push({
            actor: APIFY_ACTORS.tiktokScraper,
            body: await request.json(),
          });
          return HttpResponse.json([HANDLE_VIDEO]);
        },
      ),
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.tiktokSearchScraper}/run-sync-get-dataset-items`,
        async ({ request }) => {
          calls.push({
            actor: APIFY_ACTORS.tiktokSearchScraper,
            body: await request.json(),
          });
          return HttpResponse.json([SEARCH_VIDEO]);
        },
      ),
    );

    const result = await tiktokPoller.poll(makeCtx());
    const actors = calls.map((c) => c.actor).sort();
    expect(actors).toEqual([
      APIFY_ACTORS.tiktokScraper,
      APIFY_ACTORS.tiktokSearchScraper,
    ]);
    // Result emits two videos — one from each actor.
    expect(result.items.length).toBe(2);
    const ids = result.items
      .map((i) => (i.payload as Record<string, unknown>).aweme_id)
      .sort();
    expect(ids).toEqual(['aweme-handle-1', 'aweme-search-1']);
  });
});
