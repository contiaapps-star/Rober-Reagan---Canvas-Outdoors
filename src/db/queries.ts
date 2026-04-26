import { and, desc, eq, sql } from 'drizzle-orm';

import type { Db } from './client.js';
import { activities, competitors } from './schema.js';

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

  return rows.map((r) => ({
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
  }));
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
