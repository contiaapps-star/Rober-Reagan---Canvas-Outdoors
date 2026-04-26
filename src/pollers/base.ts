import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { activities, pollRuns } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { computeDedupeHash, existsByHash, type DedupeChannel } from '../services/dedupe.js';
import {
  summarizeActivity,
  type SummarizableCompetitor,
  type SummarizeOptions,
} from '../services/llm-summarizer.js';
import { usdToCents } from '../config/api-costs.js';

export type ActivityChannel =
  | 'website'
  | 'meta_facebook'
  | 'meta_instagram'
  | 'tiktok'
  | 'youtube'
  | 'google_ads'
  | 'seo_ranking'
  | 'seo_backlink';

export type ActivityType =
  | 'new_blog_post'
  | 'new_landing_page'
  | 'new_ad_creative'
  | 'new_video'
  | 'rank_change'
  | 'new_backlink';

export type PollItem = {
  // Effective channel of the produced activity row. May differ from the
  // poller's logical channel (e.g. meta poller emits both meta_facebook and
  // meta_instagram items).
  channel: ActivityChannel;
  activityType: ActivityType;
  sourceUrl: string;
  detectedAt: number; // unix seconds
  publishedAt?: number | null;
  // Payload used both for dedupe and to store as activities.raw_payload.
  // Must contain the dedupe-relevant fields per channel (see dedupe.ts).
  payload: Record<string, unknown>;
  // Optional precomputed dedupe hash — pollers may supply one if they want to
  // override the default channel rules; otherwise we derive one.
  dedupeHash?: string;
};

export type PollResult = {
  items: PollItem[];
  costUsdEst: number;
};

export type PollerContext = {
  competitorId: string | null;
  competitor?: SummarizableCompetitor & { id: string } | null;
  // Used by demo pollers to make output deterministic per (date, channel,
  // competitor). Defaults to today's UTC date.
  dateIso?: string;
  // Live pollers need DB access to read competitor handles, last_index_hash,
  // active keywords, and prior activities (for SEO ranking deltas). The
  // orchestrator passes its db here. Demo pollers ignore it.
  db?: Db | null;
};

export interface Poller {
  // Logical channel name for poll_runs / orchestration. May be a single
  // schema channel or a higher-level grouping (e.g. 'meta').
  readonly channel: string;
  poll(ctx: PollerContext): Promise<PollResult>;
}

export type RunPollerOptions = {
  db: Db;
  poller: Poller;
  ctx: PollerContext;
  // Concurrency for inline summarization. Defaults to 5.
  summaryConcurrency?: number;
  // LLM options forwarded to summarizeActivity (db is auto-supplied).
  llmOptions?: SummarizeOptions;
  now?: () => Date;
};

export type RunPollerResult = {
  runId: string;
  status: 'ok' | 'failed';
  channel: string;
  competitorId: string | null;
  itemsFetched: number;
  itemsInserted: number;
  costUsdEst: number;
  errorMessage: string | null;
  durationMs: number;
};

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
          'concurrency worker task failed',
        );
      }
    }
  });
  await Promise.all(workers);
}

function dedupeHashForItem(
  item: PollItem,
  competitorId: string | null,
): string {
  if (item.dedupeHash) return item.dedupeHash;
  const channel = item.channel as DedupeChannel;
  const payload = { ...item.payload };
  // Inject competitor_id if missing — required by website / SEO rules.
  if (
    (channel === 'website' ||
      channel === 'seo_ranking' ||
      channel === 'seo_backlink') &&
    competitorId &&
    !('competitor_id' in payload)
  ) {
    (payload as Record<string, unknown>).competitor_id = competitorId;
  }
  if (channel === 'seo_ranking' && !('detected_at' in payload)) {
    (payload as Record<string, unknown>).detected_at = item.detectedAt;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return computeDedupeHash(channel, payload as any);
}

function insertNewActivity(
  db: Db,
  item: PollItem,
  competitorId: string | null,
  hash: string,
): { id: string } | null {
  if (existsByHash(db, hash)) return null;
  const id = randomUUID();
  try {
    db.insert(activities)
      .values({
        id,
        competitorId: competitorId ?? null,
        inspirationSourceId: null,
        channel: item.channel,
        activityType: item.activityType,
        detectedAt: item.detectedAt,
        publishedAt: item.publishedAt ?? null,
        sourceUrl: item.sourceUrl,
        dedupeHash: hash,
        rawPayload: item.payload,
        summaryText: null,
        themesExtracted: [],
        status: 'new',
      })
      .run();
    return { id };
  } catch (err) {
    // Hash race — another concurrent poll may have inserted the same row.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return null;
    throw err;
  }
}

async function summarizeAndPersist(
  db: Db,
  activityId: string,
  item: PollItem,
  competitor: SummarizableCompetitor | null,
  llmOptions: SummarizeOptions,
): Promise<void> {
  const fallbackCompetitor: SummarizableCompetitor = competitor ?? {
    name: 'Unknown',
    domain: 'unknown.example',
    category: 'both',
    tier: 'inspiration',
  };
  const result = await summarizeActivity(
    {
      channel: item.channel,
      activityType: item.activityType,
      sourceUrl: item.sourceUrl,
      rawPayload: item.payload,
    },
    fallbackCompetitor,
    { ...llmOptions, db },
  );
  db.update(activities)
    .set({
      summaryText: result.summary,
      themesExtracted: result.themes,
    })
    .where(eq(activities.id, activityId))
    .run();
}

export async function runPoller(
  opts: RunPollerOptions,
): Promise<RunPollerResult> {
  const { db, poller, ctx } = opts;
  const now = opts.now ?? (() => new Date());
  const startedAt = Math.floor(now().getTime() / 1000);
  const t0 = Date.now();
  const runId = randomUUID();

  // Insert pending poll_run; we'll update on completion.
  db.insert(pollRuns)
    .values({
      id: runId,
      channel: poller.channel,
      competitorId: ctx.competitorId,
      startedAt,
      finishedAt: null,
      status: 'ok',
      errorMessage: null,
      itemsFetched: 0,
      costUsdEstimated: 0,
    })
    .run();

  let result: PollResult;
  try {
    result = await poller.poll(ctx);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const finishedAt = Math.floor(now().getTime() / 1000);
    db.update(pollRuns)
      .set({
        finishedAt,
        status: 'failed',
        errorMessage,
        itemsFetched: 0,
        costUsdEstimated: 0,
      })
      .where(eq(pollRuns.id, runId))
      .run();
    return {
      runId,
      status: 'failed',
      channel: poller.channel,
      competitorId: ctx.competitorId,
      itemsFetched: 0,
      itemsInserted: 0,
      costUsdEst: 0,
      errorMessage,
      durationMs: Date.now() - t0,
    };
  }

  const newRows: { id: string; item: PollItem }[] = [];
  for (const item of result.items) {
    const hash = dedupeHashForItem(item, ctx.competitorId);
    const inserted = insertNewActivity(db, item, ctx.competitorId, hash);
    if (inserted) newRows.push({ id: inserted.id, item });
  }

  await runWithConcurrency(newRows, opts.summaryConcurrency ?? 5, async (entry) => {
    await summarizeAndPersist(
      db,
      entry.id,
      entry.item,
      ctx.competitor ?? null,
      opts.llmOptions ?? {},
    );
  });

  const finishedAt = Math.floor(now().getTime() / 1000);
  db.update(pollRuns)
    .set({
      finishedAt,
      status: 'ok',
      errorMessage: null,
      itemsFetched: result.items.length,
      costUsdEstimated: usdToCents(result.costUsdEst),
    })
    .where(eq(pollRuns.id, runId))
    .run();

  return {
    runId,
    status: 'ok',
    channel: poller.channel,
    competitorId: ctx.competitorId,
    itemsFetched: result.items.length,
    itemsInserted: newRows.length,
    costUsdEst: result.costUsdEst,
    errorMessage: null,
    durationMs: Date.now() - t0,
  };
}

// ─── Demo helpers (deterministic PRNG per day × channel × competitor) ──────
// Mulberry32 PRNG seeded from an arbitrary string.
export function deterministicRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  let state = h || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function todayIsoUtc(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function pickCount(rng: () => number, max: number = 3): number {
  // 0..max inclusive
  return Math.floor(rng() * (max + 1));
}
