import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

import { competitorHandles, inspirationSources } from '../db/schema.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { PROVIDER_CALL_COSTS } from '../config/api-costs.js';
import { APIFY_ACTORS, apifyRunSync } from '../services/providers/apify.js';
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

// Apify TikTok scraper response. Both the handle scraper and the keyword
// search scraper return roughly this shape, so we share one parser.
const TikTokItemSchema = z
  .object({
    id: z.string().optional(),
    aweme_id: z.string().optional(),
    text: z.string().nullish(),
    desc: z.string().nullish(),
    createTime: z.number().nullish(),
    create_time: z.number().nullish(),
    playCount: z.number().nullish(),
    diggCount: z.number().nullish(),
    commentCount: z.number().nullish(),
    shareCount: z.number().nullish(),
    authorMeta: z
      .object({
        name: z.string().nullish(),
        nickName: z.string().nullish(),
      })
      .passthrough()
      .optional(),
    videoMeta: z
      .object({
        coverUrl: z.string().nullish(),
        originalCoverUrl: z.string().nullish(),
        duration: z.number().nullish(),
      })
      .passthrough()
      .optional(),
    webVideoUrl: z.string().nullish(),
  })
  .passthrough();

type TikTokItem = z.infer<typeof TikTokItemSchema>;

function awemeIdOf(item: TikTokItem): string | null {
  return item.aweme_id ?? item.id ?? null;
}

function captionOf(item: TikTokItem): string {
  return item.text ?? item.desc ?? '';
}

function listTikTokHandle(ctx: PollerContext): string | null {
  if (!ctx.db || !ctx.competitorId) return null;
  const row = ctx.db
    .select({ handle: competitorHandles.handle })
    .from(competitorHandles)
    .where(
      and(
        eq(competitorHandles.competitorId, ctx.competitorId),
        eq(competitorHandles.channel, 'tiktok'),
        eq(competitorHandles.isActive, true),
      ),
    )
    .get();
  return row?.handle ?? null;
}

function listTikTokInspirationSearches(ctx: PollerContext): string[] {
  if (!ctx.db) return [];
  const rows = ctx.db
    .select({ value: inspirationSources.value })
    .from(inspirationSources)
    .where(
      and(
        eq(inspirationSources.channel, 'tiktok'),
        eq(inspirationSources.kind, 'keyword_search'),
        eq(inspirationSources.isActive, true),
      ),
    )
    .all();
  return rows.map((r) => r.value).filter((v): v is string => Boolean(v));
}

function tiktokItemToPollItem(
  item: TikTokItem,
  detectedAt: number,
  fallbackHandle: string,
): PollItem | null {
  const aweme = awemeIdOf(item);
  if (!aweme) return null;
  const handle = item.authorMeta?.name ?? fallbackHandle;
  const sourceUrl =
    item.webVideoUrl ?? `https://www.tiktok.com/@${handle}/video/${aweme}`;
  const created =
    typeof item.createTime === 'number'
      ? item.createTime
      : typeof item.create_time === 'number'
      ? item.create_time
      : null;
  return {
    channel: 'tiktok',
    activityType: 'new_video',
    sourceUrl,
    detectedAt,
    publishedAt: created,
    payload: {
      handle,
      aweme_id: aweme,
      caption: captionOf(item),
      duration_s: item.videoMeta?.duration ?? null,
      views: item.playCount ?? null,
      likes: item.diggCount ?? null,
      comments: item.commentCount ?? null,
      shares: item.shareCount ?? null,
      thumbnail_url:
        item.videoMeta?.coverUrl ?? item.videoMeta?.originalCoverUrl ?? null,
    },
  };
}

async function runTikTokActor(
  apiToken: string,
  actor: string,
  input: unknown,
): Promise<unknown[]> {
  try {
    return await apifyRunSync<unknown, unknown>({
      apiToken,
      actor,
      input,
    });
  } catch (err) {
    throw new Error(
      `tiktok live: Apify actor ${actor} failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) {
    return { items: [], costUsdEst: 0 };
  }
  const apiToken = env.APIFY_API_TOKEN ?? '';
  if (!apiToken) {
    throw new Error('tiktok live: APIFY_API_TOKEN missing');
  }

  const detectedAt = Math.floor(Date.now() / 1000);
  const items: PollItem[] = [];
  let totalCost = 0;

  // 1. Handle-based scrape.
  const handle = listTikTokHandle(ctx);
  if (handle) {
    const raw = await runTikTokActor(apiToken, APIFY_ACTORS.tiktokScraper, {
      profiles: [handle],
      resultsPerPage: 30,
    });
    totalCost += PROVIDER_CALL_COSTS.apify;
    for (const r of raw) {
      const parsed = TikTokItemSchema.safeParse(r);
      if (!parsed.success) {
        throw new Error(
          `tiktok live: handle response failed schema: ${parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        );
      }
      const it = tiktokItemToPollItem(parsed.data, detectedAt, handle);
      if (it) items.push(it);
    }
  } else {
    logger.info(
      { competitor: ctx.competitor.name },
      'tiktok live: no TikTok handle configured for competitor — skipping handle scrape',
    );
  }

  // 2. Keyword-search scrape (only on the first competitor of the daily run
  // — see orchestrator wiring; for now we run per-competitor and dedupe by
  // global aweme_id at insert time).
  const searches = listTikTokInspirationSearches(ctx);
  for (const query of searches) {
    const raw = await runTikTokActor(apiToken, APIFY_ACTORS.tiktokSearchScraper, {
      hashtags: [query],
      resultsPerPage: 20,
    });
    totalCost += PROVIDER_CALL_COSTS.apify;
    for (const r of raw) {
      const parsed = TikTokItemSchema.safeParse(r);
      if (!parsed.success) {
        throw new Error(
          `tiktok live: search response failed schema: ${parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        );
      }
      const it = tiktokItemToPollItem(parsed.data, detectedAt, query);
      if (it) items.push(it);
    }
  }

  return { items, costUsdEst: totalCost };
}

export const tiktokPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
