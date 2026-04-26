import { eq, and } from 'drizzle-orm';

import { competitorHandles } from '../db/schema.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import {
  getUploadsPlaylistId,
  getVideoDetails,
  listPlaylistVideoIds,
  parseIsoDurationSeconds,
  pickPrimaryThumbnail,
} from '../services/providers/youtube.js';
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

function listYouTubeChannelId(ctx: PollerContext): string | null {
  if (!ctx.db || !ctx.competitorId) return null;
  const row = ctx.db
    .select({ handle: competitorHandles.handle })
    .from(competitorHandles)
    .where(
      and(
        eq(competitorHandles.competitorId, ctx.competitorId),
        eq(competitorHandles.channel, 'youtube'),
        eq(competitorHandles.isActive, true),
      ),
    )
    .get();
  return row?.handle ?? null;
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) return { items: [], costUsdEst: 0 };
  const channelId = listYouTubeChannelId(ctx);
  if (!channelId) {
    logger.info(
      { competitor: ctx.competitor.name },
      'youtube live: no YouTube channel id configured — skipping',
    );
    return { items: [], costUsdEst: 0 };
  }
  const apiKey = env.YOUTUBE_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('youtube live: YOUTUBE_API_KEY missing');
  }

  const uploadsId = await getUploadsPlaylistId(apiKey, channelId);
  if (!uploadsId) {
    logger.warn(
      { channelId },
      'youtube live: channel returned no uploads playlist id',
    );
    return { items: [], costUsdEst: 0 };
  }

  const videoIds = await listPlaylistVideoIds(apiKey, uploadsId, 20);
  if (videoIds.length === 0) return { items: [], costUsdEst: 0 };

  const details = await getVideoDetails(apiKey, videoIds);

  const detectedAt = Math.floor(Date.now() / 1000);
  const items: PollItem[] = [];
  for (const v of details) {
    const durationS = parseIsoDurationSeconds(v.contentDetails?.duration ?? '');
    if (durationS === 0 || durationS > 60) continue;
    const thumb = pickPrimaryThumbnail(v);
    if (thumb.height <= thumb.width) continue;

    const sourceUrl = `https://www.youtube.com/shorts/${v.id}`;
    const publishedAt = v.snippet?.publishedAt
      ? Math.floor(new Date(v.snippet.publishedAt).getTime() / 1000)
      : null;
    items.push({
      channel: 'youtube',
      activityType: 'new_video',
      sourceUrl,
      detectedAt,
      publishedAt: Number.isFinite(publishedAt as number)
        ? (publishedAt as number)
        : null,
      payload: {
        channel_id: v.snippet?.channelId ?? channelId,
        video_id: v.id,
        title: v.snippet?.title ?? '',
        duration_s: durationS,
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        thumbnail_url: thumb.url,
        thumbnail_w: thumb.width,
        thumbnail_h: thumb.height,
      },
    });
  }

  // YouTube Data API v3 has a generous quota — we treat it as $0 per call
  // for budgeting (free tier within quota). PROVIDER_CALL_COSTS.youtube is 0.
  return { items, costUsdEst: 0 };
}

export const youtubePoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
