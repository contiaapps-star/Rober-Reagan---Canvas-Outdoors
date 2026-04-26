import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const unixNow = sql`(unixepoch())`;

export const competitors = sqliteTable(
  'competitors',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    domain: text('domain').notNull().unique(),
    category: text('category', {
      enum: ['well', 'plumbing', 'both'],
    }).notNull(),
    tier: text('tier', {
      enum: ['local_same_size', 'mondo_100m', 'national', 'inspiration'],
    }).notNull(),
    logoUrl: text('logo_url'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull().default(unixNow),
    updatedAt: integer('updated_at').notNull().default(unixNow),
    lastIndexHash: text('last_index_hash'),
    lastPolledAt: integer('last_polled_at'),
    degradedChannels: text('degraded_channels', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`('[]')`),
  },
  (t) => ({
    categoryCk: check(
      'competitors_category_ck',
      sql`${t.category} IN ('well','plumbing','both')`,
    ),
    tierCk: check(
      'competitors_tier_ck',
      sql`${t.tier} IN ('local_same_size','mondo_100m','national','inspiration')`,
    ),
  }),
);

export const competitorHandles = sqliteTable(
  'competitor_handles',
  {
    id: text('id').primaryKey(),
    competitorId: text('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    channel: text('channel', {
      enum: [
        'meta_facebook',
        'meta_instagram',
        'tiktok',
        'youtube',
        'google_ads',
      ],
    }).notNull(),
    handle: text('handle'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => ({
    uniqueChannel: uniqueIndex('idx_competitor_handles_unique').on(
      t.competitorId,
      t.channel,
    ),
    channelCk: check(
      'competitor_handles_channel_ck',
      sql`${t.channel} IN ('meta_facebook','meta_instagram','tiktok','youtube','google_ads')`,
    ),
  }),
);

export const targetKeywords = sqliteTable(
  'target_keywords',
  {
    id: text('id').primaryKey(),
    keyword: text('keyword').notNull(),
    category: text('category', {
      enum: ['well', 'plumbing', 'both'],
    }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull().default(unixNow),
  },
  (t) => ({
    categoryCk: check(
      'target_keywords_category_ck',
      sql`${t.category} IN ('well','plumbing','both')`,
    ),
  }),
);

export const inspirationSources = sqliteTable(
  'inspiration_sources',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['account', 'keyword_search'] }).notNull(),
    value: text('value').notNull(),
    channel: text('channel', { enum: ['tiktok', 'youtube'] }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => ({
    kindCk: check(
      'inspiration_sources_kind_ck',
      sql`${t.kind} IN ('account','keyword_search')`,
    ),
    channelCk: check(
      'inspiration_sources_channel_ck',
      sql`${t.channel} IN ('tiktok','youtube')`,
    ),
  }),
);

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    competitorId: text('competitor_id').references(() => competitors.id, {
      onDelete: 'cascade',
    }),
    inspirationSourceId: text('inspiration_source_id').references(
      () => inspirationSources.id,
      { onDelete: 'cascade' },
    ),
    channel: text('channel', {
      enum: [
        'website',
        'meta_facebook',
        'meta_instagram',
        'tiktok',
        'youtube',
        'google_ads',
        'seo_ranking',
        'seo_backlink',
      ],
    }).notNull(),
    activityType: text('activity_type', {
      enum: [
        'new_blog_post',
        'new_landing_page',
        'new_ad_creative',
        'new_video',
        'rank_change',
        'new_backlink',
      ],
    }).notNull(),
    detectedAt: integer('detected_at').notNull(),
    publishedAt: integer('published_at'),
    sourceUrl: text('source_url').notNull(),
    dedupeHash: text('dedupe_hash').notNull(),
    rawPayload: text('raw_payload', { mode: 'json' }).notNull(),
    summaryText: text('summary_text'),
    themesExtracted: text('themes_extracted', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`(json('[]'))`),
    status: text('status', { enum: ['new', 'useful', 'skip'] })
      .notNull()
      .default('new'),
    statusChangedBy: text('status_changed_by'),
    statusChangedAt: integer('status_changed_at'),
  },
  (t) => ({
    detectedAtIdx: index('idx_activities_detected_at').on(t.detectedAt),
    filtersIdx: index('idx_activities_filters').on(
      t.competitorId,
      t.channel,
      t.status,
    ),
    dedupeHashIdx: uniqueIndex('idx_activities_dedupe_hash').on(t.dedupeHash),
    channelCk: check(
      'activities_channel_ck',
      sql`${t.channel} IN ('website','meta_facebook','meta_instagram','tiktok','youtube','google_ads','seo_ranking','seo_backlink')`,
    ),
    activityTypeCk: check(
      'activities_activity_type_ck',
      sql`${t.activityType} IN ('new_blog_post','new_landing_page','new_ad_creative','new_video','rank_change','new_backlink')`,
    ),
    statusCk: check(
      'activities_status_ck',
      sql`${t.status} IN ('new','useful','skip')`,
    ),
  }),
);

export const pollRuns = sqliteTable(
  'poll_runs',
  {
    id: text('id').primaryKey(),
    channel: text('channel').notNull(),
    competitorId: text('competitor_id').references(() => competitors.id, {
      onDelete: 'cascade',
    }),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    status: text('status', { enum: ['ok', 'failed', 'partial'] }).notNull(),
    errorMessage: text('error_message'),
    itemsFetched: integer('items_fetched').notNull().default(0),
    costUsdEstimated: integer('cost_usd_estimated').notNull().default(0),
  },
  (t) => ({
    healthIdx: index('idx_poll_runs_health').on(t.channel, t.startedAt),
    statusCk: check(
      'poll_runs_status_ck',
      sql`${t.status} IN ('ok','failed','partial')`,
    ),
  }),
);

export const apiSpendLog = sqliteTable(
  'api_spend_log',
  {
    id: text('id').primaryKey(),
    provider: text('provider', {
      enum: [
        'apify',
        'zenrows',
        'serper',
        'dataforseo',
        'youtube',
        'openrouter',
      ],
    }).notNull(),
    month: text('month').notNull(),
    spendUsd: integer('spend_usd').notNull().default(0),
    lastUpdated: integer('last_updated').notNull().default(unixNow),
  },
  (t) => ({
    providerMonthIdx: uniqueIndex('idx_api_spend_provider_month').on(
      t.provider,
      t.month,
    ),
    providerCk: check(
      'api_spend_log_provider_ck',
      sql`${t.provider} IN ('apify','zenrows','serper','dataforseo','youtube','openrouter')`,
    ),
  }),
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'agency'] }).notNull(),
    createdAt: integer('created_at').notNull().default(unixNow),
    lastLoginAt: integer('last_login_at'),
  },
  (t) => ({
    roleCk: check('users_role_ck', sql`${t.role} IN ('admin','agency')`),
  }),
);

export const sessionState = sqliteTable(
  'session_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }).notNull(),
  },
  (t) => ({
    userKeyIdx: uniqueIndex('idx_session_state_user_key').on(t.userId, t.key),
  }),
);

export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;
export type CompetitorHandle = typeof competitorHandles.$inferSelect;
export type NewCompetitorHandle = typeof competitorHandles.$inferInsert;
export type TargetKeyword = typeof targetKeywords.$inferSelect;
export type NewTargetKeyword = typeof targetKeywords.$inferInsert;
export type InspirationSource = typeof inspirationSources.$inferSelect;
export type NewInspirationSource = typeof inspirationSources.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type PollRun = typeof pollRuns.$inferSelect;
export type NewPollRun = typeof pollRuns.$inferInsert;
export type ApiSpendLog = typeof apiSpendLog.$inferSelect;
export type NewApiSpendLog = typeof apiSpendLog.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SessionState = typeof sessionState.$inferSelect;
export type NewSessionState = typeof sessionState.$inferInsert;
