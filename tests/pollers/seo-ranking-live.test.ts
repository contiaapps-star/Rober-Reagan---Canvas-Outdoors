import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import {
  activities,
  competitors,
  targetKeywords,
  type Competitor,
} from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { seoRankingPoller } from '../../src/pollers/seo-ranking.js';
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
    .insert(targetKeywords)
    .values({
      id: randomUUID(),
      keyword: 'water well drilling saginaw',
      category: 'well',
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

function insertPriorRanking(keyword: string, position: number): void {
  ctx.db
    .insert(activities)
    .values({
      id: randomUUID(),
      competitorId: competitor.id,
      inspirationSourceId: null,
      channel: 'seo_ranking',
      activityType: 'rank_change',
      detectedAt: 1714000000,
      publishedAt: 1714000000,
      sourceUrl: 'https://google.com/search',
      dedupeHash: `prior-${keyword}-${position}`,
      rawPayload: {
        competitor_id: competitor.id,
        keyword,
        new_position: position,
        previous_position: null,
      },
      summaryText: null,
      themesExtracted: [],
      status: 'new',
    })
    .run();
}

function makeSerperHandler(domainPosition: number) {
  return http.post('https://google.serper.dev/search', () =>
    HttpResponse.json({
      organic: [
        {
          position: 1,
          title: 'unrelated',
          link: 'https://something-else.example',
        },
        {
          position: domainPosition,
          title: 'AquaPoint',
          link: 'https://aquapointdrilling.example/services/well',
        },
      ],
    }),
  );
}

describe('seo_ranking live poller', () => {
  it('does NOT emit a rank_change when delta < 3 (5 → 6)', async () => {
    insertPriorRanking('water well drilling saginaw', 5);
    server.use(makeSerperHandler(6));

    const result = await seoRankingPoller.poll(makeCtx());
    expect(result.items).toEqual([]);
  });

  it('emits rank_change when delta >= 3 with full payload', async () => {
    insertPriorRanking('water well drilling saginaw', 5);
    server.use(makeSerperHandler(15));

    const result = await seoRankingPoller.poll(makeCtx());
    expect(result.items.length).toBe(1);
    const it = result.items[0]!;
    expect(it.channel).toBe('seo_ranking');
    expect(it.activityType).toBe('rank_change');
    const payload = it.payload as Record<string, unknown>;
    expect(payload.keyword).toBe('water well drilling saginaw');
    expect(payload.previous_position).toBe(5);
    expect(payload.new_position).toBe(15);
    expect(payload.delta).toBe(10);
    expect(payload.direction).toBe('down');
  });

  it('emits an anchor on first sighting (no prior data) so future runs have a baseline', async () => {
    server.use(makeSerperHandler(8));
    const result = await seoRankingPoller.poll(makeCtx());
    expect(result.items.length).toBe(1);
    const payload = result.items[0]!.payload as Record<string, unknown>;
    expect(payload.previous_position).toBeNull();
    expect(payload.new_position).toBe(8);
    expect(payload.delta).toBe(0);
  });
});
