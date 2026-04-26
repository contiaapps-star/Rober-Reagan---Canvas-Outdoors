import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

import { competitorHandles } from '../db/schema.js';
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

// Apify Meta Ads Library response shape (a subset — the actor returns a lot
// more, but we only need these fields). If Apify changes the shape, the
// strict `.parse()` below throws and the orchestrator records the run as
// failed with a descriptive error_message.
const MetaAdItemSchema = z.object({
  ad_archive_id: z.string(),
  page_name: z.string().optional(),
  page_id: z.string().optional(),
  publisher_platform: z.array(z.string()).optional(),
  snapshot: z
    .object({
      title: z.string().nullish(),
      body: z
        .union([
          z.string(),
          z.object({ text: z.string().nullish() }).passthrough(),
        ])
        .nullish(),
      cta_text: z.string().nullish(),
      link_url: z.string().nullish(),
      images: z
        .array(
          z
            .object({
              original_image_url: z.string().nullish(),
              resized_image_url: z.string().nullish(),
            })
            .passthrough(),
        )
        .optional(),
      videos: z
        .array(
          z
            .object({
              video_preview_image_url: z.string().nullish(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
  start_date: z.number().nullish(),
  start_date_string: z.string().nullish(),
});

type MetaAdItem = z.infer<typeof MetaAdItemSchema>;

function pickImageUrl(snap: MetaAdItem['snapshot']): string | null {
  const images = snap?.images ?? [];
  for (const img of images) {
    if (img.original_image_url) return img.original_image_url;
    if (img.resized_image_url) return img.resized_image_url;
  }
  const videos = snap?.videos ?? [];
  for (const v of videos) {
    if (v.video_preview_image_url) return v.video_preview_image_url;
  }
  return null;
}

function bodyToText(body: MetaAdItem['snapshot'] extends infer S
  ? S extends { body?: infer B } ? B : unknown : unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'text' in body) {
    const t = (body as { text?: unknown }).text;
    if (typeof t === 'string') return t;
  }
  return '';
}

function pickPlatformChannel(
  platforms: string[] | undefined,
): 'meta_facebook' | 'meta_instagram' {
  if (!platforms) return 'meta_facebook';
  const lower = platforms.map((p) => p.toLowerCase());
  if (lower.some((p) => p.includes('instagram'))) return 'meta_instagram';
  return 'meta_facebook';
}

function listMetaHandles(
  ctx: PollerContext,
): Array<{ handle: string; platform: 'facebook' | 'instagram' }> {
  if (!ctx.db || !ctx.competitorId) return [];
  const rows = ctx.db
    .select({ channel: competitorHandles.channel, handle: competitorHandles.handle })
    .from(competitorHandles)
    .where(
      and(
        eq(competitorHandles.competitorId, ctx.competitorId),
        eq(competitorHandles.isActive, true),
      ),
    )
    .all();
  const out: Array<{ handle: string; platform: 'facebook' | 'instagram' }> = [];
  for (const r of rows) {
    if (!r.handle) continue;
    if (r.channel === 'meta_facebook') out.push({ handle: r.handle, platform: 'facebook' });
    if (r.channel === 'meta_instagram') out.push({ handle: r.handle, platform: 'instagram' });
  }
  return out;
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) return { items: [], costUsdEst: 0 };
  const handles = listMetaHandles(ctx);
  if (handles.length === 0) {
    logger.info(
      { competitor: ctx.competitor.name },
      'meta live: no Meta handles configured for competitor — skipping',
    );
    return { items: [], costUsdEst: 0 };
  }
  const apiToken = env.APIFY_API_TOKEN ?? '';
  if (!apiToken) {
    throw new Error('meta live: APIFY_API_TOKEN missing');
  }

  const detectedAt = Math.floor(Date.now() / 1000);
  const items: PollItem[] = [];
  let totalCost = 0;

  for (const h of handles) {
    const baseUrl =
      h.platform === 'instagram'
        ? `https://www.instagram.com/${h.handle}`
        : `https://www.facebook.com/${h.handle}`;
    const input = {
      urls: [baseUrl],
      activeOnly: true,
      count: 50,
    };
    let raw: unknown[];
    try {
      raw = await apifyRunSync<typeof input, unknown>({
        apiToken,
        actor: APIFY_ACTORS.metaAdsLibrary,
        input,
      });
      totalCost += PROVIDER_CALL_COSTS.apify;
    } catch (err) {
      throw new Error(
        `meta live: Apify actor ${APIFY_ACTORS.metaAdsLibrary} failed for ${h.handle}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    for (const r of raw) {
      const parsed = MetaAdItemSchema.safeParse(r);
      if (!parsed.success) {
        throw new Error(
          `meta live: response item failed schema for handle ${h.handle}: ${parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        );
      }
      const item = parsed.data;
      const snap = item.snapshot ?? {};
      const headline = snap.title ?? '';
      const bodyText = bodyToText(snap.body);
      const cta = snap.cta_text ?? '';
      const landingUrl = snap.link_url ?? '';
      const imageUrl = pickImageUrl(snap) ?? '';
      const channel = pickPlatformChannel(item.publisher_platform);
      const advertiserId =
        item.page_id ?? `meta_advertiser_${ctx.competitor!.domain}`;
      const sourceUrl = `https://www.facebook.com/ads/library/?id=${item.ad_archive_id}`;
      const publishedAt = item.start_date
        ? Number(item.start_date)
        : item.start_date_string
        ? Math.floor(new Date(item.start_date_string).getTime() / 1000)
        : null;

      items.push({
        channel,
        activityType: 'new_ad_creative',
        sourceUrl,
        detectedAt,
        publishedAt: Number.isFinite(publishedAt as number)
          ? (publishedAt as number)
          : null,
        payload: {
          advertiser_id: advertiserId,
          ad_id: item.ad_archive_id,
          platform: h.platform,
          page_name: item.page_name ?? null,
          headline,
          body_text: bodyText,
          cta,
          image_url: imageUrl,
          landing_url: landingUrl,
          first_seen_at: publishedAt ?? detectedAt,
        },
      });
    }
  }

  return { items, costUsdEst: totalCost };
}

export const metaPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
