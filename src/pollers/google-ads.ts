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

// Apify Google Ads Transparency Center actor returns ad records keyed by
// advertiser. We only care about the landing page URL per the discovery doc:
// "not worthwhile tracking Google Ads as much because it's the same ad…
// they're just bidding more". So we trim to landing-page-level signals.
const GoogleAdsItemSchema = z
  .object({
    advertiser_id: z.string().optional(),
    advertiser_name: z.string().optional(),
    ad_id: z.string().optional(),
    landing_page_url: z.string().optional(),
    landing_url: z.string().optional(),
    final_url: z.string().optional(),
    headline: z.string().nullish(),
    first_shown: z.string().nullish(),
    last_shown: z.string().nullish(),
    format: z.string().nullish(),
  })
  .passthrough();

type GoogleAdsItem = z.infer<typeof GoogleAdsItemSchema>;

function pickLandingUrl(item: GoogleAdsItem): string | null {
  return item.landing_page_url ?? item.landing_url ?? item.final_url ?? null;
}

function listGoogleAdsHandle(ctx: PollerContext): string | null {
  if (!ctx.db || !ctx.competitorId) return null;
  const row = ctx.db
    .select({ handle: competitorHandles.handle })
    .from(competitorHandles)
    .where(
      and(
        eq(competitorHandles.competitorId, ctx.competitorId),
        eq(competitorHandles.channel, 'google_ads'),
        eq(competitorHandles.isActive, true),
      ),
    )
    .get();
  return row?.handle ?? null;
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) return { items: [], costUsdEst: 0 };
  const advertiserHandle = listGoogleAdsHandle(ctx);
  if (!advertiserHandle) {
    logger.info(
      { competitor: ctx.competitor.name },
      'google_ads live: no advertiser handle configured — skipping',
    );
    return { items: [], costUsdEst: 0 };
  }
  const apiToken = env.APIFY_API_TOKEN ?? '';
  if (!apiToken) {
    throw new Error('google_ads live: APIFY_API_TOKEN missing');
  }

  const input = { advertiserIds: [advertiserHandle], limit: 50 };
  let raw: unknown[];
  try {
    raw = await apifyRunSync<typeof input, unknown>({
      apiToken,
      actor: APIFY_ACTORS.googleAdsTransparency,
      input,
    });
  } catch (err) {
    throw new Error(
      `google_ads live: Apify actor ${APIFY_ACTORS.googleAdsTransparency} failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const detectedAt = Math.floor(Date.now() / 1000);
  const items: PollItem[] = [];
  for (const r of raw) {
    const parsed = GoogleAdsItemSchema.safeParse(r);
    if (!parsed.success) {
      throw new Error(
        `google_ads live: response item failed schema: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
    }
    const item = parsed.data;
    const landingUrl = pickLandingUrl(item);
    if (!landingUrl) continue;
    const advertiserId = item.advertiser_id ?? advertiserHandle;
    items.push({
      channel: 'google_ads',
      activityType: 'new_landing_page',
      sourceUrl: landingUrl,
      detectedAt,
      publishedAt: item.first_shown
        ? Math.floor(new Date(item.first_shown).getTime() / 1000)
        : null,
      payload: {
        advertiser_id: advertiserId,
        advertiser_name: item.advertiser_name ?? null,
        landing_page_url: landingUrl,
        headline: item.headline ?? null,
        first_shown: item.first_shown ?? null,
        last_shown: item.last_shown ?? null,
        format: item.format ?? null,
      },
    });
  }

  return { items, costUsdEst: PROVIDER_CALL_COSTS.apify };
}

export const googleAdsPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
