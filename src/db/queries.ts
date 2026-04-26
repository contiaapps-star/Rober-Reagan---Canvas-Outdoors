import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm';

import type { Db } from './client.js';
import { activities, competitorHandles, competitors, pollRuns } from './schema.js';

export type ActivityChannel =
  | 'website'
  | 'meta_facebook'
  | 'meta_instagram'
  | 'tiktok'
  | 'youtube'
  | 'google_ads'
  | 'seo_ranking'
  | 'seo_backlink';

export type ActivityStatus = 'new' | 'useful' | 'skip';

export type RecentActivityFilters = {
  channel?: ActivityChannel;
  status?: ActivityStatus;
  competitorId?: string;
};

export type RecentActivityRow = {
  id: string;
  channel: string;
  activityType: string;
  detectedAt: number;
  publishedAt: number | null;
  sourceUrl: string;
  summaryText: string | null;
  status: string;
  competitor: {
    id: string;
    name: string;
    domain: string;
    tier: string;
    category: string;
  } | null;
};

export function getRecentActivities(
  db: Db,
  limit = 50,
  filters: RecentActivityFilters = {},
): RecentActivityRow[] {
  const conditions = [];
  if (filters.channel) conditions.push(eq(activities.channel, filters.channel));
  if (filters.status) conditions.push(eq(activities.status, filters.status));
  if (filters.competitorId)
    conditions.push(eq(activities.competitorId, filters.competitorId));

  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rows = db
    .select({
      id: activities.id,
      channel: activities.channel,
      activityType: activities.activityType,
      detectedAt: activities.detectedAt,
      publishedAt: activities.publishedAt,
      sourceUrl: activities.sourceUrl,
      summaryText: activities.summaryText,
      status: activities.status,
      competitorId: activities.competitorId,
      competitorName: competitors.name,
      competitorDomain: competitors.domain,
      competitorTier: competitors.tier,
      competitorCategory: competitors.category,
    })
    .from(activities)
    .leftJoin(competitors, eq(activities.competitorId, competitors.id))
    .where(where)
    .orderBy(desc(activities.detectedAt))
    .limit(limit)
    .all();

  return rows.map(toRecentActivityRow);
}

function toRecentActivityRow(r: {
  id: string;
  channel: string;
  activityType: string;
  detectedAt: number;
  publishedAt: number | null;
  sourceUrl: string;
  summaryText: string | null;
  status: string;
  competitorId: string | null;
  competitorName: string | null;
  competitorDomain: string | null;
  competitorTier: string | null;
  competitorCategory: string | null;
}): RecentActivityRow {
  return {
    id: r.id,
    channel: r.channel,
    activityType: r.activityType,
    detectedAt: r.detectedAt,
    publishedAt: r.publishedAt,
    sourceUrl: r.sourceUrl,
    summaryText: r.summaryText,
    status: r.status,
    competitor:
      r.competitorId && r.competitorName
        ? {
            id: r.competitorId,
            name: r.competitorName,
            domain: r.competitorDomain ?? '',
            tier: r.competitorTier ?? '',
            category: r.competitorCategory ?? '',
          }
        : null,
  };
}

export type StatusCounts = {
  new: number;
  useful: number;
  skip: number;
};

export function countActivitiesByStatus(db: Db): StatusCounts {
  const rows = db
    .select({
      status: activities.status,
      count: sql<number>`count(*)`,
    })
    .from(activities)
    .groupBy(activities.status)
    .all();

  const counts: StatusCounts = { new: 0, useful: 0, skip: 0 };
  for (const r of rows) {
    if (r.status === 'new' || r.status === 'useful' || r.status === 'skip') {
      counts[r.status] = Number(r.count);
    }
  }
  return counts;
}

export type ActiveCompetitor = {
  id: string;
  name: string;
  domain: string;
  category: string;
  tier: string;
};

export function getCompetitorsActive(db: Db): ActiveCompetitor[] {
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

// ─── Health view (Phase 6) ──────────────────────────────────────────────────

export type HealthCardChannel = 'website' | 'meta' | 'google_ads' | 'tiktok' | 'youtube' | 'seo_ranking' | 'seo_backlink';

// Channels that competitors enable via competitor_handles, plus the ones that
// the orchestrator runs without explicit handle wiring (website, seo_*).
export const ALL_HEALTH_CHANNELS: HealthCardChannel[] = [
  'website',
  'meta',
  'google_ads',
  'tiktok',
  'youtube',
  'seo_ranking',
  'seo_backlink',
];

export type HealthCard = {
  competitorId: string;
  competitorName: string;
  channel: string;
  lastRunAtUnix: number | null;
  lastStatus: 'ok' | 'failed' | 'partial' | null;
  itemsFetched: number;
  errorMessage: string | null;
  // Computed indicator: 'green' (ok recent), 'amber' (ok but stale), 'red' (failed)
  state: 'green' | 'amber' | 'red';
};

export function computeCardState(opts: {
  status: 'ok' | 'failed' | 'partial' | null;
  startedAt: number | null;
  isWeekly: boolean;
  nowUnix: number;
}): 'green' | 'amber' | 'red' {
  if (!opts.status || opts.startedAt === null) return 'red';
  if (opts.status === 'failed') return 'red';
  const ageSec = Math.max(0, opts.nowUnix - opts.startedAt);
  const okWindow = opts.isWeekly ? 30 * 86400 : 86400;
  return ageSec <= okWindow ? 'green' : 'amber';
}

const WEEKLY_CHANNELS = new Set(['seo_ranking', 'seo_backlink']);

// Returns one card per (active competitor) × (channel they have configured).
// `website`, `seo_ranking`, `seo_backlink` are assumed to apply to every active
// competitor. Other channels (meta_*, tiktok, youtube, google_ads) only show
// up if a corresponding `competitor_handles` row exists.
export function getHealthCards(
  db: Db,
  nowUnix: number = Math.floor(Date.now() / 1000),
): HealthCard[] {
  // 1) Active competitors
  const comps = db
    .select({ id: competitors.id, name: competitors.name })
    .from(competitors)
    .where(eq(competitors.isActive, true))
    .orderBy(competitors.name)
    .all();

  // 2) Handles per competitor
  const handles = db
    .select({
      competitorId: competitorHandles.competitorId,
      channel: competitorHandles.channel,
      isActive: competitorHandles.isActive,
    })
    .from(competitorHandles)
    .all();

  const handleMap = new Map<string, Set<string>>();
  for (const h of handles) {
    if (!h.isActive) continue;
    if (!handleMap.has(h.competitorId)) handleMap.set(h.competitorId, new Set());
    handleMap.get(h.competitorId)!.add(h.channel);
  }

  // 3) Last poll_run per (channel, competitor)
  const allRuns = db
    .select({
      channel: pollRuns.channel,
      competitorId: pollRuns.competitorId,
      startedAt: pollRuns.startedAt,
      status: pollRuns.status,
      itemsFetched: pollRuns.itemsFetched,
      errorMessage: pollRuns.errorMessage,
    })
    .from(pollRuns)
    .all();

  type Latest = {
    startedAt: number;
    status: 'ok' | 'failed' | 'partial';
    itemsFetched: number;
    errorMessage: string | null;
  };
  const latestMap = new Map<string, Latest>();
  for (const r of allRuns) {
    const key = `${r.channel}|${r.competitorId ?? ''}`;
    const cur = latestMap.get(key);
    if (!cur || r.startedAt > cur.startedAt) {
      latestMap.set(key, {
        startedAt: r.startedAt,
        status: r.status as 'ok' | 'failed' | 'partial',
        itemsFetched: r.itemsFetched,
        errorMessage: r.errorMessage,
      });
    }
  }

  const cards: HealthCard[] = [];
  for (const c of comps) {
    const handleSet = handleMap.get(c.id) ?? new Set<string>();
    const channels = new Set<string>([
      'website',
      'seo_ranking',
      'seo_backlink',
      ...Array.from(handleSet),
    ]);
    for (const channel of channels) {
      const latestForCompetitor = latestMap.get(`${channel}|${c.id}`);
      const latestGlobal = latestMap.get(`${channel}|`);
      const latest = latestForCompetitor ?? latestGlobal ?? null;
      const isWeekly = WEEKLY_CHANNELS.has(channel);
      const state = computeCardState({
        status: latest?.status ?? null,
        startedAt: latest?.startedAt ?? null,
        isWeekly,
        nowUnix,
      });
      cards.push({
        competitorId: c.id,
        competitorName: c.name,
        channel,
        lastRunAtUnix: latest?.startedAt ?? null,
        lastStatus: latest?.status ?? null,
        itemsFetched: latest?.itemsFetched ?? 0,
        errorMessage: latest?.errorMessage ?? null,
        state,
      });
    }
  }
  // Stable order: by competitor then channel for deterministic rendering.
  cards.sort((a, b) =>
    a.competitorName === b.competitorName
      ? a.channel.localeCompare(b.channel)
      : a.competitorName.localeCompare(b.competitorName),
  );
  return cards;
}

export type DegradedCompetitor = {
  id: string;
  name: string;
  channels: string[];
};

// Returns active competitors that have one or more degraded/broken channels —
// driven by `competitors.degraded_channels` (a JSON array). Used by the
// dashboard banner.
export function getDegradedCompetitors(db: Db): DegradedCompetitor[] {
  const rows = db
    .select({
      id: competitors.id,
      name: competitors.name,
      degradedChannels: competitors.degradedChannels,
      isActive: competitors.isActive,
    })
    .from(competitors)
    .where(eq(competitors.isActive, true))
    .all();

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      channels: Array.isArray(r.degradedChannels) ? r.degradedChannels : [],
    }))
    .filter((d) => d.channels.length > 0);
}

// ─── Activity feed (Phase 3) ────────────────────────────────────────────────

export type FeedSort = 'asc' | 'desc';

export type FeedFilter = {
  channels?: string[];
  status?: ActivityStatus;
  competitorId?: string;
  detectedSinceUnix?: number;
  cursor?: { detectedAt: number; id: string };
  sort?: FeedSort;
  limit: number;
};

export function getActivityFeed(
  db: Db,
  filter: FeedFilter,
): RecentActivityRow[] {
  const conditions = [];
  if (filter.channels && filter.channels.length > 0) {
    conditions.push(
      inArray(activities.channel, filter.channels as ActivityChannel[]),
    );
  }
  if (filter.status) conditions.push(eq(activities.status, filter.status));
  if (filter.competitorId)
    conditions.push(eq(activities.competitorId, filter.competitorId));
  if (filter.detectedSinceUnix !== undefined)
    conditions.push(gte(activities.detectedAt, filter.detectedSinceUnix));

  const sort = filter.sort ?? 'desc';
  if (filter.cursor) {
    if (sort === 'desc') {
      conditions.push(
        or(
          lt(activities.detectedAt, filter.cursor.detectedAt),
          and(
            eq(activities.detectedAt, filter.cursor.detectedAt),
            lt(activities.id, filter.cursor.id),
          ),
        )!,
      );
    } else {
      conditions.push(
        or(
          sql`${activities.detectedAt} > ${filter.cursor.detectedAt}`,
          and(
            eq(activities.detectedAt, filter.cursor.detectedAt),
            sql`${activities.id} > ${filter.cursor.id}`,
          ),
        )!,
      );
    }
  }

  const where = conditions.length === 0 ? undefined : and(...conditions);
  const orderDetected =
    sort === 'desc' ? desc(activities.detectedAt) : asc(activities.detectedAt);
  const orderId = sort === 'desc' ? desc(activities.id) : asc(activities.id);

  const rows = db
    .select({
      id: activities.id,
      channel: activities.channel,
      activityType: activities.activityType,
      detectedAt: activities.detectedAt,
      publishedAt: activities.publishedAt,
      sourceUrl: activities.sourceUrl,
      summaryText: activities.summaryText,
      status: activities.status,
      competitorId: activities.competitorId,
      competitorName: competitors.name,
      competitorDomain: competitors.domain,
      competitorTier: competitors.tier,
      competitorCategory: competitors.category,
    })
    .from(activities)
    .leftJoin(competitors, eq(activities.competitorId, competitors.id))
    .where(where)
    .orderBy(orderDetected, orderId)
    .limit(filter.limit)
    .all();

  return rows.map(toRecentActivityRow);
}

export type ActivityDetailRow = RecentActivityRow & {
  rawPayload: unknown;
  themesExtracted: string[];
  dedupeHash: string;
  statusChangedBy: string | null;
  statusChangedAt: number | null;
};

export function getActivityDetailById(
  db: Db,
  id: string,
): ActivityDetailRow | null {
  const row = db
    .select({
      id: activities.id,
      channel: activities.channel,
      activityType: activities.activityType,
      detectedAt: activities.detectedAt,
      publishedAt: activities.publishedAt,
      sourceUrl: activities.sourceUrl,
      summaryText: activities.summaryText,
      status: activities.status,
      rawPayload: activities.rawPayload,
      themesExtracted: activities.themesExtracted,
      dedupeHash: activities.dedupeHash,
      statusChangedBy: activities.statusChangedBy,
      statusChangedAt: activities.statusChangedAt,
      competitorId: activities.competitorId,
      competitorName: competitors.name,
      competitorDomain: competitors.domain,
      competitorTier: competitors.tier,
      competitorCategory: competitors.category,
    })
    .from(activities)
    .leftJoin(competitors, eq(activities.competitorId, competitors.id))
    .where(eq(activities.id, id))
    .get();

  if (!row) return null;
  const base = toRecentActivityRow(row);
  return {
    ...base,
    rawPayload: row.rawPayload,
    themesExtracted: Array.isArray(row.themesExtracted) ? row.themesExtracted : [],
    dedupeHash: row.dedupeHash,
    statusChangedBy: row.statusChangedBy,
    statusChangedAt: row.statusChangedAt,
  };
}

export function getActivityById(
  db: Db,
  id: string,
): RecentActivityRow | null {
  const row = db
    .select({
      id: activities.id,
      channel: activities.channel,
      activityType: activities.activityType,
      detectedAt: activities.detectedAt,
      publishedAt: activities.publishedAt,
      sourceUrl: activities.sourceUrl,
      summaryText: activities.summaryText,
      status: activities.status,
      competitorId: activities.competitorId,
      competitorName: competitors.name,
      competitorDomain: competitors.domain,
      competitorTier: competitors.tier,
      competitorCategory: competitors.category,
    })
    .from(activities)
    .leftJoin(competitors, eq(activities.competitorId, competitors.id))
    .where(eq(activities.id, id))
    .get();

  return row ? toRecentActivityRow(row) : null;
}

export function setActivityStatus(
  db: Db,
  id: string,
  status: ActivityStatus,
  changedBy: string,
  nowUnix: number = Math.floor(Date.now() / 1000),
): RecentActivityRow | null {
  const existing = db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.id, id))
    .get();
  if (!existing) return null;

  db.update(activities)
    .set({
      status,
      statusChangedBy: changedBy,
      statusChangedAt: nowUnix,
    })
    .where(eq(activities.id, id))
    .run();

  return getActivityById(db, id);
}

// ─── KPI counts ─────────────────────────────────────────────────────────────

export type KpiCounts = {
  newToday: number;
  newThisWeek: number;
  markedUseful: number;
  pendingReview: number;
  activeChannels: number;
  failedChannels: number;
};

export function startOfTodayUtc(now: Date = new Date()): number {
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor(d / 1000);
}

export function startOfWeekMondayUtc(now: Date = new Date()): number {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0=Sun,1=Mon..6=Sat
  const diffFromMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffFromMonday);
  return Math.floor(d.getTime() / 1000);
}

export function getKpiCounts(
  db: Db,
  nowUnix: number = Math.floor(Date.now() / 1000),
): KpiCounts {
  const now = new Date(nowUnix * 1000);
  const todayStart = startOfTodayUtc(now);
  const weekStart = startOfWeekMondayUtc(now);
  const dayAgo = nowUnix - 86400;

  const newTodayRow = db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(gte(activities.detectedAt, todayStart))
    .get();

  const newWeekRow = db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(gte(activities.detectedAt, weekStart))
    .get();

  const usefulRow = db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(eq(activities.status, 'useful'))
    .get();

  const pendingRow = db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(eq(activities.status, 'new'))
    .get();

  // Active = distinct channels that have any OK poll_run within the last 24h
  const activeRows = db
    .selectDistinct({ channel: pollRuns.channel })
    .from(pollRuns)
    .where(
      and(
        eq(pollRuns.status, 'ok'),
        gte(pollRuns.startedAt, dayAgo),
      ),
    )
    .all();

  // Failed = distinct channels whose latest poll_run within last 24h is failed
  const latestPerChannel = db
    .select({
      channel: pollRuns.channel,
      latest: sql<number>`max(${pollRuns.startedAt})`.as('latest'),
    })
    .from(pollRuns)
    .where(gte(pollRuns.startedAt, dayAgo))
    .groupBy(pollRuns.channel)
    .all();

  let failedCount = 0;
  for (const lpc of latestPerChannel) {
    const latest = db
      .select({ status: pollRuns.status })
      .from(pollRuns)
      .where(
        and(
          eq(pollRuns.channel, lpc.channel),
          eq(pollRuns.startedAt, Number(lpc.latest)),
        ),
      )
      .get();
    if (latest?.status === 'failed') failedCount += 1;
  }

  return {
    newToday: Number(newTodayRow?.count ?? 0),
    newThisWeek: Number(newWeekRow?.count ?? 0),
    markedUseful: Number(usefulRow?.count ?? 0),
    pendingReview: Number(pendingRow?.count ?? 0),
    activeChannels: activeRows.length,
    failedChannels: failedCount,
  };
}
