import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { competitors } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import {
  runPoller,
  type Poller,
  type PollerContext,
  type RunPollerResult,
} from '../pollers/base.js';
import { googleAdsPoller } from '../pollers/google-ads.js';
import { metaPoller } from '../pollers/meta.js';
import { seoBacklinksPoller } from '../pollers/seo-backlinks.js';
import { seoRankingPoller } from '../pollers/seo-ranking.js';
import { tiktokPoller } from '../pollers/tiktok.js';
import { websitePoller } from '../pollers/website.js';
import { youtubePoller } from '../pollers/youtube.js';
import type { SummarizeOptions } from './llm-summarizer.js';

export type Cadence = 'daily' | 'weekly' | 'all';

export type OrchestratorOptions = {
  db: Db;
  // Override the date used for deterministic demo selection (YYYY-MM-DD UTC).
  dateIso?: string;
  // Concurrency across pollers. Defaults to 3.
  pollerConcurrency?: number;
  // Per-poller summary concurrency.
  summaryConcurrency?: number;
  // Per-poller LLM options (api key, fetch impl etc.).
  llmOptions?: SummarizeOptions;
  // Optional override of the poller registry — tests use this to force errors.
  pollers?: { daily?: Poller[]; weekly?: Poller[] };
};

export type OrchestratorSummary = {
  runs: RunPollerResult[];
  totalItems: number;
  totalInserted: number;
  totalCostUsd: number;
};

export const DAILY_POLLERS: Poller[] = [
  websitePoller,
  metaPoller,
  googleAdsPoller,
  tiktokPoller,
  youtubePoller,
];

export const WEEKLY_POLLERS: Poller[] = [seoRankingPoller, seoBacklinksPoller];

export const ALL_POLLERS: Poller[] = [...DAILY_POLLERS, ...WEEKLY_POLLERS];

function listActiveCompetitors(
  db: Db,
): Array<{
  id: string;
  name: string;
  domain: string;
  category: string;
  tier: string;
}> {
  return db
    .select({
      id: competitors.id,
      name: competitors.name,
      domain: competitors.domain,
      category: competitors.category,
      tier: competitors.tier,
    })
    .from(competitors)
    .where(eq(competitors.isActive, true))
    .orderBy(competitors.name)
    .all();
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const cap = Math.max(1, limit);
  let i = 0;
  const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      const item = items[idx]!;
      try {
        await fn(item);
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'orchestrator worker task failed',
        );
      }
    }
  });
  await Promise.all(workers);
}

async function runPollerSet(
  opts: OrchestratorOptions,
  pollers: Poller[],
): Promise<OrchestratorSummary> {
  const competitorList = listActiveCompetitors(opts.db);
  const tasks: Array<{ poller: Poller; ctx: PollerContext }> = [];
  for (const poller of pollers) {
    for (const c of competitorList) {
      tasks.push({
        poller,
        ctx: {
          competitorId: c.id,
          competitor: c,
          dateIso: opts.dateIso,
        },
      });
    }
  }

  const results: RunPollerResult[] = [];
  await runWithConcurrency(tasks, opts.pollerConcurrency ?? 3, async (task) => {
    const r = await runPoller({
      db: opts.db,
      poller: task.poller,
      ctx: task.ctx,
      summaryConcurrency: opts.summaryConcurrency,
      llmOptions: opts.llmOptions,
    });
    results.push(r);
  });

  const totalItems = results.reduce((acc, r) => acc + r.itemsFetched, 0);
  const totalInserted = results.reduce((acc, r) => acc + r.itemsInserted, 0);
  const totalCostUsd = results.reduce((acc, r) => acc + r.costUsdEst, 0);
  return { runs: results, totalItems, totalInserted, totalCostUsd };
}

export async function runDailyPoll(
  opts: OrchestratorOptions,
): Promise<OrchestratorSummary> {
  const pollers = opts.pollers?.daily ?? DAILY_POLLERS;
  return runPollerSet(opts, pollers);
}

export async function runWeeklyPoll(
  opts: OrchestratorOptions,
): Promise<OrchestratorSummary> {
  const pollers = opts.pollers?.weekly ?? WEEKLY_POLLERS;
  return runPollerSet(opts, pollers);
}

export async function runChannelPoll(
  opts: OrchestratorOptions,
  channel: string,
): Promise<OrchestratorSummary> {
  const pollers = ALL_POLLERS.filter((p) => p.channel === channel);
  if (pollers.length === 0) {
    throw new Error(`Unknown poller channel: ${channel}`);
  }
  return runPollerSet(opts, pollers);
}
