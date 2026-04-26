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

type GoogleAdsFixture = {
  slug: string;
  keyword_targeted: string;
  headline: string;
  bid_estimate_usd: number;
};

const CHANNEL = 'google_ads';

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<GoogleAdsFixture>('google-ads');
  const { templates, indices } = selectDemoTemplates(CHANNEL, ctx, fixture);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );
  const competitor = ctx.competitor;
  const advertiserId = `ga_advertiser_${competitor.id.slice(0, 8)}`;

  const items: PollItem[] = templates.map((t, i) => {
    const idx = indices[i] ?? i;
    const landingUrl = `https://${competitor.domain}/lp/${t.slug}-${idx}`;
    return {
      channel: 'google_ads',
      activityType: 'new_landing_page',
      sourceUrl: landingUrl,
      detectedAt,
      publishedAt: detectedAt - 86400,
      payload: {
        advertiser_id: advertiserId,
        landing_page_url: landingUrl,
        keyword_targeted: t.keyword_targeted,
        headline: t.headline,
        bid_estimate_usd: t.bid_estimate_usd,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const googleAdsPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
