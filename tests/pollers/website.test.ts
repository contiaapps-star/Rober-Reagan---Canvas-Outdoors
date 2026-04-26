import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { competitors, type Competitor } from '../../src/db/schema.js';
import type { PollItem, PollerContext } from '../../src/pollers/base.js';
import { websitePoller } from '../../src/pollers/website.js';
import { metaPoller } from '../../src/pollers/meta.js';
import { googleAdsPoller } from '../../src/pollers/google-ads.js';
import { tiktokPoller } from '../../src/pollers/tiktok.js';
import { youtubePoller } from '../../src/pollers/youtube.js';
import { seoRankingPoller } from '../../src/pollers/seo-ranking.js';
import { seoBacklinksPoller } from '../../src/pollers/seo-backlinks.js';
import { createTestDb } from '../helpers/db.js';

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
  competitor = ctx.db
    .select()
    .from(competitors)
    .all()[0]!;
});

afterEach(() => {
  ctx.sqlite.close();
});

function makeCtx(overrides: Partial<PollerContext> = {}): PollerContext {
  return {
    competitorId: competitor.id,
    competitor: { ...competitor, id: competitor.id },
    dateIso: '2026-04-25',
    ...overrides,
  };
}

describe('website poller (demo mode)', () => {
  it('returns 0–3 items deterministically per (date, channel, competitor)', async () => {
    const a = await websitePoller.poll(makeCtx({ dateIso: '2026-04-25' }));
    const b = await websitePoller.poll(makeCtx({ dateIso: '2026-04-25' }));
    expect(a.items.length).toBeGreaterThanOrEqual(0);
    expect(a.items.length).toBeLessThanOrEqual(3);
    expect(b.items.map((i) => i.sourceUrl)).toEqual(
      a.items.map((i) => i.sourceUrl),
    );

    // A different date should be allowed to differ — at minimum, one of
    // several days yields a different selection.
    const samples = ['2026-04-26', '2026-04-27', '2026-04-28', '2026-04-29'];
    let anyDifferent = false;
    for (const d of samples) {
      const r = await websitePoller.poll(makeCtx({ dateIso: d }));
      if (r.items.length !== a.items.length) {
        anyDifferent = true;
        break;
      }
      const otherUrls = r.items.map((i) => i.sourceUrl).join('|');
      const aUrls = a.items.map((i) => i.sourceUrl).join('|');
      if (otherUrls !== aUrls) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it('demo poll items match the PollItem shape', async () => {
    // Sweep dates until we get at least one item to inspect.
    let result: { items: PollItem[] } = { items: [] };
    for (let day = 25; day < 60; day++) {
      result = await websitePoller.poll(makeCtx({ dateIso: `2026-04-${String(day).padStart(2, '0')}` }));
      if (result.items.length > 0) break;
    }
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(typeof item.channel).toBe('string');
      expect(item.channel).toBe('website');
      expect(['new_blog_post', 'new_landing_page']).toContain(item.activityType);
      expect(typeof item.sourceUrl).toBe('string');
      expect(item.sourceUrl.startsWith('https://')).toBe(true);
      expect(typeof item.detectedAt).toBe('number');
      expect(item.detectedAt).toBeGreaterThan(0);
      expect(typeof item.payload).toBe('object');
      expect(item.payload).not.toBeNull();
      expect((item.payload as Record<string, unknown>).url).toBe(item.sourceUrl);
    }
  });

  it('every poller throws "Live mode pending in Fase 5" when OPERATION_MODE=live', async () => {
    const previous = process.env.OPERATION_MODE;
    process.env.OPERATION_MODE = 'live';
    try {
      const pollers = [
        websitePoller,
        metaPoller,
        googleAdsPoller,
        tiktokPoller,
        youtubePoller,
        seoRankingPoller,
        seoBacklinksPoller,
      ];
      for (const p of pollers) {
        await expect(p.poll(makeCtx())).rejects.toThrow(/Live mode pending in Fase 5/);
      }
    } finally {
      process.env.OPERATION_MODE = previous;
    }
  });
});
