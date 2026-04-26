import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import {
  competitorHandles,
  competitors,
  type Competitor,
} from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { metaPoller } from '../../src/pollers/meta.js';
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
      channel: 'meta_facebook',
      handle: 'aquapointdrilling',
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

const VALID_AD = {
  ad_archive_id: '1234567890',
  page_name: 'AquaPoint',
  page_id: 'fb-page-001',
  publisher_platform: ['facebook'],
  snapshot: {
    title: 'Spring well-drilling promo',
    body: { text: 'Get 10% off this April only.' },
    cta_text: 'Learn More',
    link_url: 'https://aquapointdrilling.example/promo/spring',
    images: [{ original_image_url: 'https://cdn.example/img1.jpg' }],
  },
  start_date: 1714000000,
};

describe('meta live poller — Apify call shape', () => {
  it('sends Authorization Bearer header and body urls/activeOnly/count to the ads-library actor', async () => {
    let captured: { auth: string | null; bodyJson: Record<string, unknown> | null; pathname: string | null } = {
      auth: null,
      bodyJson: null,
      pathname: null,
    };
    server.use(
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.metaAdsLibrary}/run-sync-get-dataset-items`,
        async ({ request }) => {
          captured.auth = request.headers.get('authorization');
          captured.pathname = new URL(request.url).pathname;
          captured.bodyJson = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json([VALID_AD]);
        },
      ),
    );

    const result = await metaPoller.poll(makeCtx());
    expect(captured.auth).toBe('Bearer test-apify-token');
    expect(captured.pathname).toContain(APIFY_ACTORS.metaAdsLibrary);
    expect(captured.bodyJson).toMatchObject({
      activeOnly: true,
      count: 50,
    });
    expect(Array.isArray(captured.bodyJson?.urls)).toBe(true);
    const urls = captured.bodyJson?.urls as string[];
    expect(urls[0]).toContain('aquapointdrilling');

    // And the actor's response was correctly mapped to one PollItem.
    expect(result.items.length).toBe(1);
    const it = result.items[0]!;
    expect(it.channel).toBe('meta_facebook');
    expect(it.activityType).toBe('new_ad_creative');
    expect((it.payload as Record<string, unknown>).ad_id).toBe('1234567890');
    expect((it.payload as Record<string, unknown>).headline).toBe('Spring well-drilling promo');
  });
});

describe('meta live poller — schema validation', () => {
  it('throws a descriptive error when a required field is missing', async () => {
    const broken = { foo: 'bar', not_an_ad: true };
    server.use(
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.metaAdsLibrary}/run-sync-get-dataset-items`,
        () => HttpResponse.json([broken]),
      ),
    );
    await expect(metaPoller.poll(makeCtx())).rejects.toThrow(
      /response item failed schema/i,
    );
  });
});
