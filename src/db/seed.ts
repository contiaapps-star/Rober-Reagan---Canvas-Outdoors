import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

import type { Db } from './client.js';
import {
  activities,
  apiSpendLog,
  competitorHandles,
  competitors,
  inspirationSources,
  pollRuns,
  targetKeywords,
  users,
  type NewActivity,
  type NewCompetitor,
  type NewCompetitorHandle,
  type NewInspirationSource,
  type NewTargetKeyword,
} from './schema.js';

type CompetitorSpec = {
  name: string;
  domain: string;
  category: 'well' | 'plumbing' | 'both';
  tier: 'local_same_size' | 'mondo_100m' | 'national';
};

const WELL_COMPETITORS: CompetitorSpec[] = [
  {
    name: 'Clearwater Wells TX',
    domain: 'clearwaterwellstx.example',
    category: 'well',
    tier: 'local_same_size',
  },
  {
    name: 'Trinity Valley Well Services',
    domain: 'trinityvalleywell.example',
    category: 'well',
    tier: 'local_same_size',
  },
  {
    name: 'AquaPoint Drilling Co.',
    domain: 'aquapointdrilling.example',
    category: 'both',
    tier: 'mondo_100m',
  },
  {
    name: 'North Texas Well Pros',
    domain: 'northtexaswellpros.example',
    category: 'well',
    tier: 'local_same_size',
  },
  {
    name: 'DeepRock Water Wells',
    domain: 'deeprockwaterwells.example',
    category: 'well',
    tier: 'mondo_100m',
  },
  {
    name: 'Lonestar Well & Pump',
    domain: 'lonestarwellpump.example',
    category: 'well',
    tier: 'local_same_size',
  },
  {
    name: 'PrairieFlow Drilling',
    domain: 'prairieflowdrilling.example',
    category: 'well',
    tier: 'mondo_100m',
  },
  {
    name: 'BedrockWater Texas',
    domain: 'bedrockwatertx.example',
    category: 'both',
    tier: 'mondo_100m',
  },
  {
    name: 'Nationwide Well Services',
    domain: 'nationwidewell.example',
    category: 'well',
    tier: 'national',
  },
  {
    name: 'AquaCore National',
    domain: 'aquacorenational.example',
    category: 'both',
    tier: 'national',
  },
];

const PLUMBING_COMPETITORS: CompetitorSpec[] = [
  {
    name: 'AquaPoint Plumbing North Texas',
    domain: 'aquapointplumbingnt.example',
    category: 'plumbing',
    tier: 'local_same_size',
  },
  {
    name: 'Reliant Plumbing DFW',
    domain: 'reliantplumbingdfw.example',
    category: 'plumbing',
    tier: 'mondo_100m',
  },
  {
    name: 'Hometown Plumbers Saginaw',
    domain: 'hometownplumberssaginaw.example',
    category: 'plumbing',
    tier: 'local_same_size',
  },
  {
    name: 'Five Star Plumbing TX',
    domain: 'fivestarplumbingtx.example',
    category: 'plumbing',
    tier: 'mondo_100m',
  },
  {
    name: 'Patriot Plumbing Services',
    domain: 'patriotplumbing.example',
    category: 'plumbing',
    tier: 'mondo_100m',
  },
  {
    name: 'BluePipe Plumbers',
    domain: 'bluepipeplumbers.example',
    category: 'plumbing',
    tier: 'local_same_size',
  },
  {
    name: 'MetroPlex Plumbing Pros',
    domain: 'metroplexplumbingpros.example',
    category: 'plumbing',
    tier: 'mondo_100m',
  },
  {
    name: 'FastFlow Plumbing',
    domain: 'fastflowplumbing.example',
    category: 'plumbing',
    tier: 'mondo_100m',
  },
  {
    name: 'Roto-Rooter (national)',
    domain: 'rotorooter-national.example',
    category: 'plumbing',
    tier: 'national',
  },
  {
    name: 'Mr. Rooter Plumbing',
    domain: 'mrrooterplumbing.example',
    category: 'plumbing',
    tier: 'national',
  },
  {
    name: 'Benjamin Franklin Plumbing',
    domain: 'benjaminfranklinplumbing.example',
    category: 'plumbing',
    tier: 'national',
  },
  {
    name: 'ARS Rescue Rooter',
    domain: 'arsrescuerooter.example',
    category: 'plumbing',
    tier: 'national',
  },
];

const ALL_COMPETITORS: CompetitorSpec[] = [
  ...WELL_COMPETITORS,
  ...PLUMBING_COMPETITORS,
];

const KEYWORDS: { keyword: string; category: 'well' | 'plumbing' | 'both' }[] = [
  { keyword: 'water well drilling Fort Worth', category: 'well' },
  { keyword: 'plumber Saginaw TX', category: 'plumbing' },
  { keyword: 'well pump repair North Texas', category: 'well' },
  { keyword: 'water filtration DFW', category: 'both' },
  { keyword: 'tankless water heater install', category: 'plumbing' },
  { keyword: 'emergency plumber 24/7', category: 'plumbing' },
  { keyword: 'septic system installation', category: 'plumbing' },
  { keyword: 'water softener replacement', category: 'both' },
  { keyword: 'drain cleaning services', category: 'plumbing' },
  { keyword: 'irrigation system repair', category: 'both' },
  { keyword: 'well drilling cost', category: 'well' },
  { keyword: 'best plumber near me', category: 'plumbing' },
  { keyword: 'water well inspection', category: 'well' },
  { keyword: 'water well drilling near me', category: 'well' },
  { keyword: 'burst pipe repair', category: 'plumbing' },
];

const INSPIRATION_SOURCES: NewInspirationSource[] = [
  {
    id: '',
    kind: 'account',
    value: '@trade_tiktok_pro',
    channel: 'tiktok',
    isActive: true,
  },
  {
    id: '',
    kind: 'account',
    value: '@plumbing_dad',
    channel: 'tiktok',
    isActive: true,
  },
  {
    id: '',
    kind: 'account',
    value: '@waterwellbob',
    channel: 'youtube',
    isActive: true,
  },
  {
    id: '',
    kind: 'keyword_search',
    value: 'plumbing fail viral',
    channel: 'tiktok',
    isActive: true,
  },
  {
    id: '',
    kind: 'keyword_search',
    value: 'water well drilling tiktok',
    channel: 'tiktok',
    isActive: true,
  },
];

const HANDLE_CHANNELS = [
  'meta_facebook',
  'meta_instagram',
  'tiktok',
  'youtube',
  'google_ads',
] as const;

type HandleChannel = (typeof HANDLE_CHANNELS)[number];

function deterministicRng(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pickHandlesFor(spec: CompetitorSpec): HandleChannel[] {
  const rng = deterministicRng(spec.domain);
  const picked = HANDLE_CHANNELS.filter(() => rng() > 0.15);
  if (picked.length < 4) return HANDLE_CHANNELS.slice(0, 4);
  return picked;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

type ActivityChannel = NewActivity['channel'];
type ActivityType = NewActivity['activityType'];
type Status = NewActivity['status'];

type Plan = {
  channel: ActivityChannel;
  activityType: ActivityType;
  count: number;
  buildPayload: (ctx: PayloadCtx) => Record<string, unknown>;
  pickUrl: (ctx: PayloadCtx) => string;
};

type PayloadCtx = {
  competitor: CompetitorSpec & { id: string };
  rng: () => number;
  index: number;
};

function pickStatus(rng: () => number): Status {
  const r = rng();
  if (r < 0.7) return 'new';
  if (r < 0.9) return 'useful';
  return 'skip';
}

function buildPlans(): Plan[] {
  return [
    {
      channel: 'website',
      activityType: 'new_blog_post',
      count: 30,
      pickUrl: (ctx) =>
        `https://${ctx.competitor.domain}/blog/${slugify(`post-${ctx.index}`)}`,
      buildPayload: (ctx) => ({
        title: `How to handle ${
          ctx.competitor.category === 'well' ? 'well pump issues' : 'plumbing leaks'
        } #${ctx.index}`,
        word_count: 500 + Math.floor(ctx.rng() * 1500),
        author: 'Marketing Team',
      }),
    },
    {
      channel: 'website',
      activityType: 'new_landing_page',
      count: 15,
      pickUrl: (ctx) =>
        `https://${ctx.competitor.domain}/services/${slugify(`landing-${ctx.index}`)}`,
      buildPayload: (ctx) => ({
        title: `Service landing page #${ctx.index}`,
        cta: 'Schedule Free Estimate',
        promo: ctx.rng() > 0.5 ? '$50 off' : null,
      }),
    },
    {
      channel: 'meta_facebook',
      activityType: 'new_ad_creative',
      count: 12,
      pickUrl: (ctx) =>
        `https://facebook.com/ads/library/?id=${(1e10 + ctx.index).toString()}`,
      buildPayload: (ctx) => ({
        creative_hash: createHash('sha256')
          .update(`${ctx.competitor.domain}:meta:${ctx.index}`)
          .digest('hex'),
        headline: `Trusted ${ctx.competitor.category} services in DFW`,
        cta: 'Book Now',
        landing_url: `https://${ctx.competitor.domain}/promo`,
        image_url: `https://cdn.example/img/${ctx.index}.jpg`,
      }),
    },
    {
      channel: 'meta_instagram',
      activityType: 'new_ad_creative',
      count: 8,
      pickUrl: (ctx) =>
        `https://instagram.com/ads/${(2e10 + ctx.index).toString()}`,
      buildPayload: (ctx) => ({
        creative_hash: createHash('sha256')
          .update(`${ctx.competitor.domain}:ig:${ctx.index}`)
          .digest('hex'),
        format: ctx.rng() > 0.5 ? 'reel' : 'static',
        cta: 'Learn More',
      }),
    },
    {
      channel: 'google_ads',
      activityType: 'new_landing_page',
      count: 5,
      pickUrl: (ctx) =>
        `https://${ctx.competitor.domain}/lp/google-${ctx.index}`,
      buildPayload: (ctx) => ({
        keyword_targeted: 'emergency plumber',
        bid_estimate_usd: Number((2 + ctx.rng() * 8).toFixed(2)),
      }),
    },
    {
      channel: 'tiktok',
      activityType: 'new_video',
      count: 15,
      pickUrl: (ctx) =>
        `https://www.tiktok.com/@${slugify(ctx.competitor.name)}/video/${(7e15 + ctx.index).toString()}`,
      buildPayload: (ctx) => ({
        aweme_id: `${7e15 + ctx.index}`,
        duration_s: 15 + Math.floor(ctx.rng() * 45),
        likes: Math.floor(ctx.rng() * 5000),
      }),
    },
    {
      channel: 'youtube',
      activityType: 'new_video',
      count: 10,
      pickUrl: (ctx) =>
        `https://www.youtube.com/shorts/yt${(1e9 + ctx.index).toString()}`,
      buildPayload: (ctx) => ({
        video_id: `yt${1e9 + ctx.index}`,
        duration_s: 30 + Math.floor(ctx.rng() * 30),
        thumbnail_w: 720,
        thumbnail_h: 1280,
      }),
    },
    {
      channel: 'seo_ranking',
      activityType: 'rank_change',
      count: 10,
      pickUrl: (ctx) =>
        `https://${ctx.competitor.domain}/rank/${ctx.index}`,
      buildPayload: (ctx) => ({
        keyword: 'plumber Saginaw TX',
        previous_position: 8,
        new_position: 8 + (ctx.rng() > 0.5 ? -3 : 4),
      }),
    },
    {
      channel: 'seo_backlink',
      activityType: 'new_backlink',
      count: 5,
      pickUrl: (ctx) =>
        `https://referring-site-${ctx.index}.example/post`,
      buildPayload: (ctx) => ({
        referring_domain: `referring-site-${ctx.index}.example`,
        domain_rating: 30 + Math.floor(ctx.rng() * 50),
      }),
    },
  ];
}

function dedupeHashFor(
  competitorId: string,
  channel: string,
  sourceUrl: string,
  index: number,
): string {
  return createHash('sha256')
    .update(`${competitorId}|${channel}|${sourceUrl}|${index}`)
    .digest('hex');
}

export type SeedCounts = {
  competitors: number;
  competitor_handles: number;
  target_keywords: number;
  inspiration_sources: number;
  activities: number;
  poll_runs: number;
  api_spend_log: number;
  users: number;
};

export type SeedOptions = {
  force?: boolean;
  rngSeed?: string;
};

export class SeedAlreadyExistsError extends Error {
  constructor() {
    super(
      'DB ya seedeada — borrá data/app.db para regenerar (o pasá --force para limpiar y re-seedear).',
    );
    this.name = 'SeedAlreadyExistsError';
  }
}

export async function runSeed(db: Db, opts: SeedOptions = {}): Promise<SeedCounts> {
  const existing = db.select({ count: sql<number>`count(*)` }).from(competitors).get();
  const hasData = (existing?.count ?? 0) > 0;

  if (hasData && !opts.force) {
    throw new SeedAlreadyExistsError();
  }

  if (hasData && opts.force) {
    db.delete(activities).run();
    db.delete(pollRuns).run();
    db.delete(apiSpendLog).run();
    db.delete(competitorHandles).run();
    db.delete(competitors).run();
    db.delete(targetKeywords).run();
    db.delete(inspirationSources).run();
    db.delete(users).run();
  }

  const rng = deterministicRng(opts.rngSeed ?? 'flowcore-seed');
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysSec = 30 * 24 * 3600;

  const competitorRows: (NewCompetitor & { spec: CompetitorSpec })[] =
    ALL_COMPETITORS.map((spec) => ({
      id: randomUUID(),
      name: spec.name,
      domain: spec.domain,
      category: spec.category,
      tier: spec.tier,
      logoUrl: null,
      isActive: true,
      spec,
    }));

  db.insert(competitors)
    .values(competitorRows.map(({ spec: _spec, ...rest }) => rest))
    .run();

  const handleRows: NewCompetitorHandle[] = [];
  for (const c of competitorRows) {
    const channels = pickHandlesFor(c.spec);
    for (const channel of channels) {
      handleRows.push({
        id: randomUUID(),
        competitorId: c.id!,
        channel,
        handle:
          channel === 'google_ads'
            ? null
            : `${slugify(c.spec.name)}_${channel.split('_').pop()}`,
        isActive: true,
      });
    }
  }
  db.insert(competitorHandles).values(handleRows).run();

  const keywordRows: NewTargetKeyword[] = KEYWORDS.map((k) => ({
    id: randomUUID(),
    keyword: k.keyword,
    category: k.category,
    isActive: true,
  }));
  db.insert(targetKeywords).values(keywordRows).run();

  const inspirationRows: NewInspirationSource[] = INSPIRATION_SOURCES.map((s) => ({
    ...s,
    id: randomUUID(),
  }));
  db.insert(inspirationSources).values(inspirationRows).run();

  const plans = buildPlans();
  const activityRows: NewActivity[] = [];
  let globalIdx = 0;
  for (const plan of plans) {
    for (let i = 0; i < plan.count; i++) {
      const competitor = competitorRows[Math.floor(rng() * competitorRows.length)]!;
      const ctx: PayloadCtx = {
        competitor: { ...competitor.spec, id: competitor.id! },
        rng,
        index: globalIdx,
      };
      const sourceUrl = plan.pickUrl(ctx);
      const detectedAt = now - Math.floor(rng() * thirtyDaysSec);
      const publishedAt = detectedAt - Math.floor(rng() * 24 * 3600);
      const status = pickStatus(rng);
      activityRows.push({
        id: randomUUID(),
        competitorId: competitor.id!,
        inspirationSourceId: null,
        channel: plan.channel,
        activityType: plan.activityType,
        detectedAt,
        publishedAt,
        sourceUrl,
        dedupeHash: dedupeHashFor(competitor.id!, plan.channel, sourceUrl, globalIdx),
        rawPayload: plan.buildPayload(ctx),
        summaryText: '[Pendiente generar con LLM en Fase 4]',
        themesExtracted: ['pricing', 'local-seo'],
        status,
        statusChangedBy: status === 'new' ? null : 'seed-script',
        statusChangedAt: status === 'new' ? null : detectedAt,
      });
      globalIdx++;
    }
  }
  db.insert(activities).values(activityRows).run();

  const pollRunSeeds = [
    {
      channel: 'website',
      status: 'ok' as const,
      itemsFetched: 7,
      errorMessage: null,
    },
    {
      channel: 'meta_facebook',
      status: 'ok' as const,
      itemsFetched: 12,
      errorMessage: null,
    },
    {
      channel: 'tiktok',
      status: 'ok' as const,
      itemsFetched: 4,
      errorMessage: null,
    },
    {
      channel: 'youtube',
      status: 'ok' as const,
      itemsFetched: 3,
      errorMessage: null,
    },
    {
      channel: 'tiktok',
      status: 'failed' as const,
      itemsFetched: 0,
      errorMessage: 'Apify actor timeout after 60s',
    },
  ];
  db.insert(pollRuns)
    .values(
      pollRunSeeds.map((p) => ({
        id: randomUUID(),
        channel: p.channel,
        competitorId: null,
        startedAt: now - Math.floor(rng() * 86400),
        finishedAt: now - Math.floor(rng() * 3600),
        status: p.status,
        errorMessage: p.errorMessage,
        itemsFetched: p.itemsFetched,
        costUsdEstimated: 0,
      })),
    )
    .run();

  const month = new Date().toISOString().slice(0, 7);
  db.insert(apiSpendLog)
    .values([
      {
        id: randomUUID(),
        provider: 'apify',
        month,
        spendUsd: 4230,
      },
      {
        id: randomUUID(),
        provider: 'openrouter',
        month,
        spendUsd: 310,
      },
    ])
    .run();

  db.insert(users)
    .values({
      id: randomUUID(),
      email: 'robert@flowcorewater.com',
      passwordHash: '[set en Fase 7]',
      role: 'admin',
    })
    .run();

  return {
    competitors: competitorRows.length,
    competitor_handles: handleRows.length,
    target_keywords: keywordRows.length,
    inspiration_sources: inspirationRows.length,
    activities: activityRows.length,
    poll_runs: pollRunSeeds.length,
    api_spend_log: 2,
    users: 1,
  };
}
