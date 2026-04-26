import { and, desc, eq } from 'drizzle-orm';

import { activities, targetKeywords } from '../db/schema.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { PROVIDER_CALL_COSTS } from '../config/api-costs.js';
import {
  findDomainPosition,
  serperSearch,
} from '../services/providers/serper.js';
import {
  type Poller,
  type PollItem,
  type PollResult,
  type PollerContext,
} from './base.js';
import {
  dateToUnixUtc,
  isDemo,
  loadFixture,
  selectDemoTemplates,
} from './demo-helpers.js';

type SeoRankingFixture = {
  keyword: string;
  previous_position: number;
  new_position: number;
  search_volume: number;
  engine: string;
};

const CHANNEL = 'seo_ranking';
const MIN_DELTA = 3;

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<SeoRankingFixture>('seo-ranking');
  // Only changes >= 3 positions count.
  const significant = fixture.filter(
    (f) => Math.abs(f.previous_position - f.new_position) >= MIN_DELTA,
  );
  const { templates } = selectDemoTemplates(CHANNEL, ctx, significant, 3);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );
  const competitor = ctx.competitor;

  const items: PollItem[] = templates.map((t) => {
    const delta = t.new_position - t.previous_position;
    return {
      channel: 'seo_ranking',
      activityType: 'rank_change',
      sourceUrl: `https://${competitor.domain}/?q=${encodeURIComponent(t.keyword)}`,
      detectedAt,
      publishedAt: detectedAt,
      payload: {
        competitor_id: competitor.id,
        keyword: t.keyword,
        previous_position: t.previous_position,
        new_position: t.new_position,
        delta,
        direction: delta < 0 ? 'up' : 'down',
        search_volume: t.search_volume,
        engine: t.engine,
        detected_at: detectedAt,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

function listActiveKeywords(ctx: PollerContext): string[] {
  if (!ctx.db) return [];
  const rows = ctx.db
    .select({ keyword: targetKeywords.keyword })
    .from(targetKeywords)
    .where(eq(targetKeywords.isActive, true))
    .orderBy(targetKeywords.keyword)
    .all();
  return rows.map((r) => r.keyword);
}

// Look up the most recent rank we recorded for (competitor, keyword). We
// stored the prior position in raw_payload.new_position, so we read that.
function lookupLastPosition(
  ctx: PollerContext,
  keyword: string,
): number | null {
  if (!ctx.db || !ctx.competitorId) return null;
  const rows = ctx.db
    .select({
      raw: activities.rawPayload,
    })
    .from(activities)
    .where(
      and(
        eq(activities.competitorId, ctx.competitorId),
        eq(activities.channel, 'seo_ranking'),
      ),
    )
    .orderBy(desc(activities.detectedAt))
    .all();
  for (const r of rows) {
    const payload = r.raw as Record<string, unknown> | null;
    if (payload && typeof payload === 'object' && payload.keyword === keyword) {
      const v = payload.new_position;
      if (typeof v === 'number') return v;
      if (v === null) return null;
    }
  }
  return null;
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) return { items: [], costUsdEst: 0 };
  const apiKey = env.SERPER_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('seo_ranking live: SERPER_API_KEY missing');
  }
  const keywords = listActiveKeywords(ctx);
  if (keywords.length === 0) {
    logger.info('seo_ranking live: no active keywords — skipping');
    return { items: [], costUsdEst: 0 };
  }

  const domain = ctx.competitor.domain;
  const detectedAt = Math.floor(Date.now() / 1000);
  const items: PollItem[] = [];
  let totalCost = 0;

  for (const keyword of keywords) {
    let response: Awaited<ReturnType<typeof serperSearch>>;
    try {
      response = await serperSearch({ apiKey, query: keyword });
      totalCost += PROVIDER_CALL_COSTS.serper;
    } catch (err) {
      throw new Error(
        `seo_ranking live: Serper failed for "${keyword}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const newPosition = findDomainPosition(response.organic, domain);
    const oldPosition = lookupLastPosition(ctx, keyword);

    // First sighting — record once for baseline so future deltas have an
    // anchor; treat as a rank_change with delta=0 only when we have a
    // position. Tighter: only emit when there is movement OR first detection.
    if (oldPosition === null && newPosition === null) continue;

    const delta =
      newPosition === null
        ? 100 // dropped out of top 100
        : oldPosition === null
        ? 0 // first time we see them
        : newPosition - oldPosition;

    // First-time sighting always emits (anchor); otherwise require delta >= 3.
    if (oldPosition !== null && Math.abs(delta) < 3) continue;

    items.push({
      channel: 'seo_ranking',
      activityType: 'rank_change',
      sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(keyword)}`,
      detectedAt,
      publishedAt: detectedAt,
      payload: {
        competitor_id: ctx.competitorId,
        keyword,
        previous_position: oldPosition,
        new_position: newPosition,
        delta,
        direction: delta < 0 ? 'up' : 'down',
        engine: 'google',
        detected_at: detectedAt,
      },
    });
  }

  return { items, costUsdEst: totalCost };
}

export const seoRankingPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
