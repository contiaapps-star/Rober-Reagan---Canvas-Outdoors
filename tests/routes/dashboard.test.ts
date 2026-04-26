import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { Hono } from 'hono';

import { runSeed } from '../../scripts/seed.js';
import {
  activities,
  competitors,
  type NewActivity,
} from '../../src/db/schema.js';
import { startOfTodayUtc } from '../../src/db/queries.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { buildDashboardApp } from '../helpers/dashboard-app.js';

let ctx: ReturnType<typeof createTestDb>;
let app: Hono;

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  app = buildDashboardApp(ctx.db);
});

afterEach(() => {
  ctx.sqlite.close();
});

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

function activityRowIds(html: string): string[] {
  const ids: string[] = [];
  const re = /data-testid="activity-row-([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids[ids.length] = m[1]!;
  return ids;
}

function firstCompetitorId(db: TestDb): string {
  const row = db.select({ id: competitors.id }).from(competitors).get();
  if (!row) throw new Error('no competitor seeded');
  return row.id;
}

function insertActivityNow(db: TestDb, channel: string): NewActivity {
  const cId = firstCompetitorId(db);
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const sourceUrl = `https://example.com/freshly-${id}`;
  const row: NewActivity = {
    id,
    competitorId: cId,
    inspirationSourceId: null,
    channel: channel as NewActivity['channel'],
    activityType: 'new_blog_post',
    detectedAt: now,
    publishedAt: now,
    sourceUrl,
    dedupeHash: createHash('sha256').update(`${id}|${channel}`).digest('hex'),
    rawPayload: { fixture: 'today' },
    summaryText: 'Fresh activity inserted at test time.',
    themesExtracted: ['fixture'],
    status: 'new',
    statusChangedBy: null,
    statusChangedAt: null,
  };
  db.insert(activities).values(row).run();
  return row;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns 200 with all 6 KPI tiles + numbers coherent with the seed', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('Intelligence Board');
    expect(html).toContain('data-testid="kpi-new-today"');
    expect(html).toContain('data-testid="kpi-new-this-week"');
    expect(html).toContain('data-testid="kpi-marked-useful"');
    expect(html).toContain('data-testid="kpi-pending-review"');
    expect(html).toContain('data-testid="kpi-active-channels"');
    expect(html).toContain('data-testid="kpi-failed-channels"');

    // Activity feed table is rendered with rows from seed.
    expect(html).toContain('data-testid="activity-feed"');
    const rowCount = countMatches(html, /data-testid="activity-row-/g);
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount).toBeLessThanOrEqual(25);

    // The seed always produces 'useful' and 'new' activities, so both tile
    // values must be > 0 (rendered in the value span).
    const usefulMatch = html.match(
      /data-testid="kpi-marked-useful"[^>]*>\s*<span[^>]*>(\d+)<\/span>/,
    );
    const pendingMatch = html.match(
      /data-testid="kpi-pending-review"[^>]*>\s*<span[^>]*>(\d+)<\/span>/,
    );
    expect(usefulMatch).not.toBeNull();
    expect(pendingMatch).not.toBeNull();
    expect(Number(usefulMatch![1])).toBeGreaterThan(0);
    expect(Number(pendingMatch![1])).toBeGreaterThan(0);
  });
});

describe('GET /activities/feed?channel=website', () => {
  it('returns only rows from the website channel', async () => {
    const res = await app.request('/activities/feed?channel=website&range=all&limit=100');
    expect(res.status).toBe(200);
    const html = await res.text();

    const rowChannelMatches = html.match(/data-channel="([a-z_]+)"/g) ?? [];
    expect(rowChannelMatches.length).toBeGreaterThan(0);
    for (const m of rowChannelMatches) {
      expect(m).toBe('data-channel="website"');
    }
  });
});

describe('GET /activities/feed?status=useful', () => {
  it('returns only rows with status=useful', async () => {
    const res = await app.request('/activities/feed?status=useful&range=all&limit=100');
    expect(res.status).toBe(200);
    const html = await res.text();

    const matches = html.match(/data-status="([a-z]+)"/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    // tr data-status comes first; status pill data-status follows. Filter to tr-only by using activity-row pattern.
    const trStatuses = [
      ...html.matchAll(/data-testid="activity-row-[^"]+"[^>]*data-status="([a-z]+)"/g),
    ].map((m) => m[1]);
    expect(trStatuses.length).toBeGreaterThan(0);
    for (const s of trStatuses) {
      expect(s).toBe('useful');
    }
  });
});

describe('GET /activities/feed?range=today', () => {
  it('returns only activities detected today (UTC)', async () => {
    // Insert an activity guaranteed to be within today's window.
    insertActivityNow(ctx.db, 'website');

    const res = await app.request('/activities/feed?range=today&limit=100');
    expect(res.status).toBe(200);
    const html = await res.text();

    const ids = activityRowIds(html);
    expect(ids.length).toBeGreaterThan(0);

    const todayStart = startOfTodayUtc();
    for (const id of ids) {
      const row = ctx.db
        .select({ d: activities.detectedAt })
        .from(activities)
        .where(eq(activities.id, id))
        .get();
      expect(row).toBeDefined();
      expect(row!.d).toBeGreaterThanOrEqual(todayStart);
    }
  });
});

describe('GET /activities/feed?competitor_id=', () => {
  it('filters rows to a single competitor', async () => {
    const cId = firstCompetitorId(ctx.db);

    const res = await app.request(
      `/activities/feed?competitor_id=${cId}&range=all&limit=100`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    const ids = activityRowIds(html);
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const row = ctx.db
        .select({ c: activities.competitorId })
        .from(activities)
        .where(eq(activities.id, id))
        .get();
      expect(row?.c).toBe(cId);
    }
  });
});

describe('POST /activities/:id/status — useful', () => {
  it('persists status and returns a fragment with a green pill', async () => {
    const row = ctx.db.select({ id: activities.id }).from(activities).get();
    if (!row) throw new Error('no activities seeded');

    const res = await app.request(`/activities/${row.id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'useful' }),
    });
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('pill-success');
    expect(html).toContain('USEFUL');
    expect(html).toContain(`activity-row-${row.id}`);

    const persisted = ctx.db
      .select({ status: activities.status })
      .from(activities)
      .where(eq(activities.id, row.id))
      .get();
    expect(persisted?.status).toBe('useful');
  });
});

describe('POST /activities/:id/status — invalid status', () => {
  it('returns 400 when the status value is not one of new|useful|skip', async () => {
    const row = ctx.db.select({ id: activities.id }).from(activities).get();
    if (!row) throw new Error('no activities seeded');

    const res = await app.request(`/activities/${row.id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /activities//status — empty id', () => {
  it('returns 404 when the id segment is empty', async () => {
    const res = await app.request('/activities//status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'useful' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /activities/feed cursor pagination', () => {
  it('returns disjoint pages and emits <!-- end --> on the final page', async () => {
    // channel=meta_facebook → 12 rows in seed; with limit=5, ceil(12/5)=3 pages.
    const url1 = '/activities/feed?channel=meta_facebook&range=all&limit=5';
    const r1 = await app.request(url1);
    expect(r1.status).toBe(200);
    const h1 = await r1.text();
    const ids1 = activityRowIds(h1);
    expect(ids1.length).toBe(5);
    expect(h1).toContain('data-testid="load-more"');
    expect(h1).not.toContain('<!-- end -->');

    // Extract cursor for page 2.
    const cursorMatch1 = h1.match(/cursor=([A-Za-z0-9_\-=]+)/);
    expect(cursorMatch1).not.toBeNull();
    const cursor1 = cursorMatch1![1]!;

    const r2 = await app.request(
      `/activities/feed?channel=meta_facebook&range=all&limit=5&cursor=${cursor1}&append=1`,
    );
    expect(r2.status).toBe(200);
    const h2 = await r2.text();
    const ids2 = activityRowIds(h2);
    expect(ids2.length).toBe(5);
    // No overlap between page 1 and page 2.
    for (const id of ids2) expect(ids1.includes(id)).toBe(false);
    expect(h2).toContain('data-testid="load-more"');

    const cursorMatch2 = h2.match(/cursor=([A-Za-z0-9_\-=]+)/);
    expect(cursorMatch2).not.toBeNull();
    const cursor2 = cursorMatch2![1]!;

    const r3 = await app.request(
      `/activities/feed?channel=meta_facebook&range=all&limit=5&cursor=${cursor2}&append=1`,
    );
    expect(r3.status).toBe(200);
    const h3 = await r3.text();
    const ids3 = activityRowIds(h3);
    // Remaining 2 rows + end marker.
    expect(ids3.length).toBe(2);
    for (const id of ids3) {
      expect(ids1.includes(id)).toBe(false);
      expect(ids2.includes(id)).toBe(false);
    }
    expect(h3).toContain('<!-- end -->');
  });
});

describe('GET / with filter cookie', () => {
  it('renders the feed with the filter from flowcore_filter_state cookie pre-applied', async () => {
    const cookieValue = encodeURIComponent(
      JSON.stringify({ channel: 'meta_facebook', range: 'all' }),
    );
    const res = await app.request('/', {
      headers: { Cookie: `flowcore_filter_state=${cookieValue}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();

    // Every rendered row should be meta_facebook.
    const channelMatches = html.match(
      /data-testid="activity-row-[^"]+"[^>]*data-channel="([a-z_]+)"/g,
    );
    expect(channelMatches).not.toBeNull();
    expect(channelMatches!.length).toBeGreaterThan(0);
    for (const m of channelMatches!) {
      expect(m.endsWith('data-channel="meta_facebook"')).toBe(true);
    }

    // The hidden filter input should reflect the channel.
    expect(html).toMatch(
      /data-filter-input="channel"[^>]*value="meta_facebook"|name="channel"[^>]*value="meta_facebook"/,
    );
  });
});
