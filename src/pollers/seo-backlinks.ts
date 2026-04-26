import {
  type Poller,
  type PollItem,
  type PollResult,
  type PollerContext,
} from './base.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { PROVIDER_CALL_COSTS } from '../config/api-costs.js';
import {
  dataForSeoBacklinks,
  extractBacklinkItems,
} from '../services/providers/dataforseo.js';
import {
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

function isoOneWeekAgo(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 7 * 86400_000);
  return d.toISOString().slice(0, 10);
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) return { items: [], costUsdEst: 0 };
  const login = env.DATAFORSEO_LOGIN ?? '';
  const password = env.DATAFORSEO_PASSWORD ?? '';
  if (!login || !password) {
    throw new Error('seo_backlink live: DATAFORSEO_LOGIN/PASSWORD missing');
  }

  const drThreshold = env.BACKLINK_DR_THRESHOLD;
  const detectedAt = Math.floor(Date.now() / 1000);

  let response: Awaited<ReturnType<typeof dataForSeoBacklinks>>;
  try {
    response = await dataForSeoBacklinks({
      login,
      password,
      target: ctx.competitor.domain,
      limit: 100,
      firstSeenIso: isoOneWeekAgo(),
    });
  } catch (err) {
    throw new Error(
      `seo_backlink live: DataForSEO failed for ${ctx.competitor.domain}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const raw = extractBacklinkItems(response);
  const items: PollItem[] = [];
  for (const it of raw) {
    const dr = Number(it.domain_from_rank ?? it.rank ?? 0);
    if (!Number.isFinite(dr) || dr < drThreshold) continue;
    const referring = (it.domain_from ?? '').toLowerCase();
    if (!referring) continue;
    const pageUrl = it.url_from ?? `https://${referring}`;
    items.push({
      channel: 'seo_backlink',
      activityType: 'new_backlink',
      sourceUrl: pageUrl,
      detectedAt,
      publishedAt: it.first_seen
        ? Math.floor(new Date(it.first_seen).getTime() / 1000)
        : null,
      payload: {
        competitor_id: ctx.competitorId,
        referring_domain: referring,
        domain_rating: dr,
        anchor_text: it.anchor ?? null,
        page_url: pageUrl,
        first_seen_at: it.first_seen ?? null,
      },
    });
  }
  if (items.length === 0) {
    logger.info(
      { competitor: ctx.competitor.name },
      'seo_backlink live: no new backlinks above DR threshold',
    );
  }

  return { items, costUsdEst: PROVIDER_CALL_COSTS.dataforseo };
}

export const seoBacklinksPoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
