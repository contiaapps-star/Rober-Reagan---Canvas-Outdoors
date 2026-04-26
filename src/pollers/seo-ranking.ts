import {
  type Poller,
  type PollItem,
  type PollResult,
  type PollerContext,
} from './base.js';
import {
  assertDemoMode,
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

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const seoRankingPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
