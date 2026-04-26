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

function firstCompetitorId(db: TestDb): string {
  const row = db.select({ id: competitors.id }).from(competitors).get();
  if (!row) throw new Error('no competitor seeded');
  return row.id;
}

function insertActivity(
  db: TestDb,
  channel: string,
  rawPayload: Record<string, unknown>,
  summary = 'Test summary for detail view',
): string {
  const cId = firstCompetitorId(db);
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const sourceUrl = `https://example.com/detail-${id}`;
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
    rawPayload,
    summaryText: summary,
    themesExtracted: ['detail-test'],
    status: 'new',
    statusChangedBy: null,
    statusChangedAt: null,
  };
  db.insert(activities).values(row).run();
  return id;
}

describe('GET /activities/:id', () => {
  it('returns 200 + HTML with summary, channel and raw payload', async () => {
    const id = insertActivity(ctx.db, 'website', {
      title: 'Detail page title',
      first_paragraph: 'Some content here',
      author: 'Test',
    });

    const res = await app.request(`/activities/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('data-testid="detail-title"');
    expect(html).toContain('Test summary for detail view');
    // Channel chip present
    expect(html).toContain('Website');
    // Raw payload pretty-printed
    expect(html).toContain('data-testid="raw-payload"');
    expect(html).toContain('Detail page title');
    expect(html).toContain('Some content here');
    // Why this matters card present
    expect(html).toContain('data-testid="why-this-matters"');
    // Action buttons
    expect(html).toContain('data-testid="detail-btn-useful"');
    expect(html).toContain('data-testid="detail-btn-skip"');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.request('/activities/this-id-does-not-exist-9999');
    expect(res.status).toBe(404);
  });

  it('sanitizes raw_payload — apify_api_key and other secrets are NOT rendered', async () => {
    const secret = 'super-secret-do-not-leak-12345';
    const id = insertActivity(ctx.db, 'tiktok', {
      aweme_id: '7000000001',
      duration_s: 22,
      apify_api_key: secret,
      access_token: secret,
      nested: {
        password: secret,
        ok_field: 'visible-value',
      },
    });

    const res = await app.request(`/activities/${id}`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // The secret value must NOT appear anywhere
    expect(html).not.toContain(secret);
    // The visible (non-sensitive) field still shows up
    expect(html).toContain('visible-value');
    // Sensitive keys are still listed but with [REDACTED]
    expect(html).toContain('[REDACTED]');
  });

  it('POST status from detail page persists and redirects back to /activities/:id', async () => {
    const id = insertActivity(ctx.db, 'website', { title: 'X' });

    const res = await app.request(
      `/activities/${id}/status?return_to=detail`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'status=useful',
        redirect: 'manual',
      },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`/activities/${id}`);

    const persisted = ctx.db
      .select({ status: activities.status })
      .from(activities)
      .where(eq(activities.id, id))
      .get();
    expect(persisted?.status).toBe('useful');

    // Following the redirect renders the detail page with USEFUL status.
    const follow = await app.request(`/activities/${id}`);
    expect(follow.status).toBe(200);
    const html = await follow.text();
    expect(html).toContain('data-testid="meta-status"');
    expect(html).toMatch(/USEFUL/);
  });
});
