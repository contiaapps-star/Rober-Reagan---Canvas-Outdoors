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

type WebsiteFixture = {
  slug: string;
  title: string;
  activity_type: 'new_blog_post' | 'new_landing_page';
  word_count?: number;
  author?: string;
  cta?: string;
  promo?: string | null;
  kind: 'blog' | 'landing';
};

const CHANNEL = 'website';

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<WebsiteFixture>('website');
  const { templates, indices } = selectDemoTemplates(CHANNEL, ctx, fixture);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );

  const items: PollItem[] = templates.map((t, i) => {
    const idx = indices[i] ?? i;
    const path = t.kind === 'blog' ? 'blog' : 'services';
    const url = `https://${ctx.competitor!.domain}/${path}/${t.slug}-${idx}`;
    return {
      channel: 'website',
      activityType: t.activity_type,
      sourceUrl: url,
      detectedAt,
      publishedAt: detectedAt - 3600,
      payload: {
        url,
        title: t.title,
        kind: t.kind,
        word_count: t.word_count ?? null,
        cta: t.cta ?? null,
        promo: t.promo ?? null,
        author: t.author ?? null,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const websitePoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
