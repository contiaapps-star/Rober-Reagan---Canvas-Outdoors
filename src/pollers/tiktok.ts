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

type TikTokFixture = {
  aweme_suffix: string;
  caption: string;
  duration_s: number;
  likes: number;
  shares: number;
  music_title: string;
};

const CHANNEL = 'tiktok';

function slugifyHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<TikTokFixture>('tiktok');
  const { templates, indices } = selectDemoTemplates(CHANNEL, ctx, fixture);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );
  const competitor = ctx.competitor;
  const handle = slugifyHandle(competitor.name);

  const items: PollItem[] = templates.map((t, i) => {
    const idx = indices[i] ?? i;
    const awemeId = `${7e15 + idx}_${t.aweme_suffix}`;
    const sourceUrl = `https://www.tiktok.com/@${handle}/video/${awemeId}`;
    return {
      channel: 'tiktok',
      activityType: 'new_video',
      sourceUrl,
      detectedAt,
      publishedAt: detectedAt - 21600,
      payload: {
        handle,
        aweme_id: awemeId,
        caption: t.caption,
        duration_s: t.duration_s,
        likes: t.likes,
        shares: t.shares,
        music_title: t.music_title,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const tiktokPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
