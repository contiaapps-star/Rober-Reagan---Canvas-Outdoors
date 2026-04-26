import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import {
  competitorHandles,
  competitors,
  type Competitor,
} from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { googleAdsPoller } from '../../src/pollers/google-ads.js';
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
      channel: 'google_ads',
      handle: 'AR123456789',
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

describe('google_ads live poller', () => {
  it('extracts landing_page_url from each Apify item and emits new_landing_page', async () => {
    server.use(
      http.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTORS.googleAdsTransparency}/run-sync-get-dataset-items`,
        async ({ request }) => {
          const auth = request.headers.get('authorization');
          if (auth !== 'Bearer test-apify-token') {
            return new HttpResponse('bad token', { status: 401 });
          }
          return HttpResponse.json([
            {
              advertiser_id: 'AR123456789',
              advertiser_name: 'AquaPoint',
              landing_page_url: 'https://aquapointdrilling.example/lp/spring',
              headline: 'Spring savings',
              first_shown: '2026-04-20',
              format: 'text',
            },
            {
              advertiser_id: 'AR123456789',
              advertiser_name: 'AquaPoint',
              final_url: 'https://aquapointdrilling.example/lp/repair',
              headline: 'Repair specials',
              first_shown: '2026-04-22',
              format: 'image',
            },
          ]);
        },
      ),
    );

    const result = await googleAdsPoller.poll(makeCtx());
    expect(result.items.length).toBe(2);
    for (const it of result.items) {
      expect(it.channel).toBe('google_ads');
      expect(it.activityType).toBe('new_landing_page');
      expect(it.sourceUrl.startsWith('https://')).toBe(true);
      expect((it.payload as Record<string, unknown>).advertiser_id).toBe('AR123456789');
    }
    expect(result.items.map((i) => i.sourceUrl).sort()).toEqual([
      'https://aquapointdrilling.example/lp/repair',
      'https://aquapointdrilling.example/lp/spring',
    ]);
  });

  it('skips advertisers without a configured google_ads handle', async () => {
    // Disable the handle.
    ctx.db.delete(competitorHandles).run();
    const result = await googleAdsPoller.poll(makeCtx());
    expect(result.items).toEqual([]);
  });
});
