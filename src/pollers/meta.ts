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

type MetaFixture = {
  platform: 'facebook' | 'instagram';
  headline: string;
  body_text: string;
  cta_text: string;
  image_filename: string;
  format: string;
};

const CHANNEL = 'meta';

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<MetaFixture>('meta');
  const { templates, indices } = selectDemoTemplates(CHANNEL, ctx, fixture);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );
  const competitor = ctx.competitor;
  const advertiserId = `fb_advertiser_${competitor.id.slice(0, 8)}`;

  const items: PollItem[] = templates.map((t, i) => {
    const idx = indices[i] ?? i;
    const adId = `${1e10 + idx}`;
    const platform = t.platform;
    const channel: 'meta_facebook' | 'meta_instagram' =
      platform === 'instagram' ? 'meta_instagram' : 'meta_facebook';
    const sourceUrl =
      platform === 'instagram'
        ? `https://www.instagram.com/ads/${adId}`
        : `https://www.facebook.com/ads/library/?id=${adId}`;
    const imageUrl = `https://cdn.example/meta/${competitor.domain}/${t.image_filename}`;
    const landingUrl = `https://${competitor.domain}/promo/${idx}`;
    return {
      channel,
      activityType: 'new_ad_creative',
      sourceUrl,
      detectedAt,
      publishedAt: detectedAt - 7200,
      payload: {
        advertiser_id: advertiserId,
        ad_id: adId,
        platform,
        headline: t.headline,
        body_text: t.body_text,
        cta: t.cta_text,
        image_url: imageUrl,
        landing_url: landingUrl,
        format: t.format,
        first_seen_at: detectedAt,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const metaPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
