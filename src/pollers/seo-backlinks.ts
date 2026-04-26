import {
  type Poller,
  type PollItem,
  type PollResult,
  type PollerContext,
} from './base.js';
import { env } from '../lib/env.js';
import {
  assertDemoMode,
  dateToUnixUtc,
  isDemo,
  loadFixture,
  selectDemoTemplates,
} from './demo-helpers.js';

type SeoBacklinkFixture = {
  referring_domain: string;
  domain_rating: number;
  first_seen_at: string;
  anchor_text: string;
  page_url: string;
};

const CHANNEL = 'seo_backlink';

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<SeoBacklinkFixture>('seo-backlinks');
  const drThreshold = env.BACKLINK_DR_THRESHOLD;
  const eligible = fixture.filter((f) => f.domain_rating >= drThreshold);
  const { templates } = selectDemoTemplates(CHANNEL, ctx, eligible, 3);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );
  const competitor = ctx.competitor;

  const items: PollItem[] = templates.map((t) => ({
    channel: 'seo_backlink',
    activityType: 'new_backlink',
    sourceUrl: t.page_url,
    detectedAt,
    publishedAt: Math.floor(new Date(`${t.first_seen_at}T00:00:00Z`).getTime() / 1000),
    payload: {
      competitor_id: competitor.id,
      referring_domain: t.referring_domain.toLowerCase(),
      domain_rating: t.domain_rating,
      anchor_text: t.anchor_text,
      page_url: t.page_url,
      first_seen_at: t.first_seen_at,
    },
  }));

  return { items, costUsdEst: 0 };
}

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const seoBacklinksPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
