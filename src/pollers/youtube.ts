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

type YouTubeFixture = {
  video_suffix: string;
  title: string;
  duration_s: number;
  views: number;
  thumbnail_w: number;
  thumbnail_h: number;
};

const CHANNEL = 'youtube';

function channelIdFor(competitorId: string): string {
  return `UC_${competitorId.replace(/-/g, '').slice(0, 20)}`;
}

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<YouTubeFixture>('youtube');
  const { templates, indices } = selectDemoTemplates(CHANNEL, ctx, fixture);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );
  const competitor = ctx.competitor;
  const channelId = channelIdFor(competitor.id);

  // Per CLAUDE.md, only Shorts: duration_s <= 60 AND vertical aspect.
  const filtered = templates.filter(
    (t) => t.duration_s <= 60 && t.thumbnail_h > t.thumbnail_w,
  );
  const filteredIndices = templates
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.duration_s <= 60 && t.thumbnail_h > t.thumbnail_w)
    .map(({ i }) => indices[i] ?? i);

  const items: PollItem[] = filtered.map((t, i) => {
    const idx = filteredIndices[i] ?? i;
    const videoId = `yt${1e9 + idx}_${t.video_suffix}`;
    const sourceUrl = `https://www.youtube.com/shorts/${videoId}`;
    return {
      channel: 'youtube',
      activityType: 'new_video',
      sourceUrl,
      detectedAt,
      publishedAt: detectedAt - 14400,
      payload: {
        channel_id: channelId,
        video_id: videoId,
        title: t.title,
        duration_s: t.duration_s,
        views: t.views,
        thumbnail_w: t.thumbnail_w,
        thumbnail_h: t.thumbnail_h,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

async function pollLive(_ctx: PollerContext): Promise<PollResult> {
  throw new Error('Live mode pending in Fase 5');
}

export const youtubePoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    assertDemoMode(CHANNEL);
    return pollLive(ctx);
  },
};
