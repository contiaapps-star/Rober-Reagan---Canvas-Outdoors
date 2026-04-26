import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import type { Db } from '../db/client.js';
import type { AppEnv } from '../lib/types.js';
import {
  getActivityDetailById,
  getActivityFeed,
  getCompetitorsActive,
  getDegradedCompetitors,
  getKpiCounts,
  setActivityStatus,
  type ActivityStatus,
  type FeedFilter,
} from '../db/queries.js';
import {
  DEFAULT_FILTER_STATE,
  FILTER_COOKIE_NAME,
  decodeCursor,
  encodeCursor,
  expandChannelFilter,
  parseFilterFromQuery,
  rangeToSinceUnix,
  readFilterCookie,
  serializeFilterCookieValue,
  type FilterState,
} from '../lib/feed-filters.js';
import { readFlash } from '../lib/flash.js';
import { ActivityFeedRegion } from '../views/dashboard/feed.js';
import { ActivityRow, StatusPill } from '../views/dashboard/activity-row.js';
import { ActivityDetailView } from '../views/dashboard/activity-detail.js';
import { DashboardView } from '../views/dashboard/index.js';
import { FiltersBar } from '../views/dashboard/filters.js';
import { KpiRow } from '../views/dashboard/kpi-row.js';
import { Fragment } from 'hono/jsx';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const statusBodySchema = z.object({
  status: z.enum(['new', 'useful', 'skip']),
});

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function formDataToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    out[k] = typeof v === 'string' ? v : '';
  });
  return out;
}

function buildFeedFilter(
  state: FilterState,
  cursor: string | undefined,
  limit: number,
  nowUnix: number,
): FeedFilter {
  const filter: FeedFilter = { limit, sort: state.sort };
  const channels = expandChannelFilter(state.channel);
  if (channels) filter.channels = channels;
  if (state.status) filter.status = state.status as ActivityStatus;
  if (state.competitorId) filter.competitorId = state.competitorId;
  const since = rangeToSinceUnix(state.range, nowUnix);
  if (since !== undefined) filter.detectedSinceUnix = since;
  const cur = decodeCursor(cursor);
  if (cur) filter.cursor = cur;
  return filter;
}

function writeFilterCookie(
  c: import('hono').Context,
  state: FilterState,
): void {
  setCookie(c, FILTER_COOKIE_NAME, serializeFilterCookieValue(state), {
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function createDashboardRoute(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // ─── GET / ────────────────────────────────────────────────────────────────
  app.get('/', (c) => {
    const cookieRaw = getCookie(c, FILTER_COOKIE_NAME);
    const fromCookie = readFilterCookie(cookieRaw);
    const state = parseFilterFromQuery(c.req.query(), fromCookie);
    const limit = parseLimit(c.req.query('limit'));
    const cursor = c.req.query('cursor');

    const nowUnix = Math.floor(Date.now() / 1000);
    const filter = buildFeedFilter(state, cursor, limit + 1, nowUnix);
    const rows = getActivityFeed(db, filter);

    const hasMore = rows.length > limit;
    if (hasMore) rows.length = limit;
    const last = rows[rows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.detectedAt, last.id) : null;

    const counts = getKpiCounts(db, nowUnix);
    const competitors = getCompetitorsActive(db);
    const degraded = getDegradedCompetitors(db);

    writeFilterCookie(c, state);

    return c.html(
      <DashboardView
        counts={counts}
        rows={rows}
        state={state}
        competitors={competitors}
        nextCursor={nextCursor}
        hasMore={hasMore}
        lastUpdatedIso={new Date(nowUnix * 1000).toISOString()}
        nowUnix={nowUnix}
        flash={readFlash(c)}
        degraded={degraded}
      />,
    );
  });

  // ─── GET /activities/feed ─────────────────────────────────────────────────
  app.get('/activities/feed', (c) => {
    const cookieRaw = getCookie(c, FILTER_COOKIE_NAME);
    const fromCookie = readFilterCookie(cookieRaw);
    const state = parseFilterFromQuery(c.req.query(), fromCookie);
    const limit = parseLimit(c.req.query('limit'));
    const cursor = c.req.query('cursor');
    const isAppend = c.req.query('append') === '1' || cursor !== undefined;

    const nowUnix = Math.floor(Date.now() / 1000);
    const filter = buildFeedFilter(state, cursor, limit + 1, nowUnix);
    const rows = getActivityFeed(db, filter);

    const hasMore = rows.length > limit;
    if (hasMore) rows.length = limit;
    const last = rows[rows.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.detectedAt, last.id) : null;

    writeFilterCookie(c, state);

    // For non-pagination requests (filter changes / sort toggles), tell htmx
    // to push the canonical dashboard URL `/?<query>` instead of the partial
    // `/activities/feed?<query>`. The chips/sort headers all use
    // hx-push-url="true" which would otherwise leak the fragment endpoint
    // into the address bar.
    if (!isAppend && c.req.header('HX-Request') === 'true') {
      const params = new URLSearchParams();
      if (state.range && state.range !== 'all') params.set('range', state.range);
      if (state.channel) params.set('channel', state.channel);
      if (state.status) params.set('status', state.status);
      if (state.competitorId) params.set('competitor_id', state.competitorId);
      if (state.sort && state.sort !== 'desc') params.set('sort', state.sort);
      const qs = params.toString();
      c.header('HX-Push-Url', qs ? `/?${qs}` : '/');
    }

    const feed = (
      <ActivityFeedRegion
        rows={rows}
        state={state}
        nextCursor={nextCursor}
        hasMore={hasMore}
        isAppend={isAppend}
        nowUnix={nowUnix}
      />
    );
    // On a fresh filter change (not pagination), also re-render the chips so
    // the active state matches the new filter. htmx picks this up via OOB swap.
    if (!isAppend) {
      const competitors = getCompetitorsActive(db);
      return c.html(
        <Fragment>
          {feed}
          <FiltersBar state={state} competitors={competitors} oob />
        </Fragment>,
      );
    }
    return c.html(feed);
  });

  // ─── POST /activities/:id/status ──────────────────────────────────────────
  app.post('/activities/:id/status', async (c) => {
    const id = c.req.param('id');
    if (!id || id.trim() === '') return c.text('Not found', 404);

    let payload: unknown = {};
    const ct = c.req.header('content-type') ?? '';
    try {
      if (ct.includes('application/json')) {
        payload = await c.req.json();
      } else if (
        ct.includes('application/x-www-form-urlencoded') ||
        ct.includes('multipart/form-data')
      ) {
        const form = await c.req.formData();
        payload = formDataToObject(form);
      } else {
        // Try JSON first, fall back to formData
        try {
          payload = await c.req.json();
        } catch {
          try {
            const form = await c.req.formData();
            payload = formDataToObject(form);
          } catch {
            payload = {};
          }
        }
      }
    } catch {
      payload = {};
    }

    const parsed = statusBodySchema.safeParse(payload);
    if (!parsed.success) {
      return c.text('Invalid status', 400);
    }

    const actor = c.get('user')?.email ?? 'system';
    const updated = setActivityStatus(db, id, parsed.data.status, actor);
    if (!updated) {
      return c.text('Activity not found', 404);
    }

    // POST from the detail page sets return_to=detail — bounce back to /activities/:id
    if (c.req.query('return_to') === 'detail') {
      return c.redirect(`/activities/${id}`, 303);
    }

    // Refresh KPIs alongside the row swap so "Marked Useful" / "Pending Review"
    // / "New Today" reflect the change without a full reload.
    const nowUnix = Math.floor(Date.now() / 1000);
    const counts = getKpiCounts(db, nowUnix);
    return c.html(
      <Fragment>
        <ActivityRow row={updated} />
        <KpiRow counts={counts} oob />
      </Fragment>,
    );
  });

  // ─── GET /activities/:id ──────────────────────────────────────────────────
  app.get('/activities/:id', (c) => {
    const id = c.req.param('id');
    if (!id || id.trim() === '') return c.text('Not found', 404);
    // Reserve a few sub-paths to avoid being treated as ids.
    if (id === 'feed') return c.text('Not found', 404);
    const row = getActivityDetailById(db, id);
    if (!row) return c.text('Activity not found', 404);
    return c.html(<ActivityDetailView row={row} />);
  });

  return app;
}

import { getDb } from '../db/client.js';
export const dashboardRoute: Hono<AppEnv> = createDashboardRoute(getDb());

// Named export for consistency with how settings exposes a default state for
// the cookie helper used in tests/views.
export { DEFAULT_FILTER_STATE };
