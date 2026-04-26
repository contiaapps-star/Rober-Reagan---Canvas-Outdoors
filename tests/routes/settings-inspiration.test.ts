import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { runSeed } from '../../scripts/seed.js';
import { inspirationSources } from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { buildSettingsApp, formBody } from '../helpers/settings-app.js';

let ctx: ReturnType<typeof createTestDb>;
let app: Hono;

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  app = buildSettingsApp(ctx.db);
});

afterEach(() => {
  ctx.sqlite.close();
});

function firstInspirationId(db: TestDb): string {
  const row = db
    .select({ id: inspirationSources.id })
    .from(inspirationSources)
    .get();
  if (!row) throw new Error('no inspiration source seeded');
  return row.id;
}

describe('GET /settings/inspiration', () => {
  it('returns 200 with HTML containing "Inspiration Sources" and 5 rows', async () => {
    const res = await app.request('/settings/inspiration');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Inspiration Sources');
    const rowMatches = html.match(/data-testid="inspiration-row-/g) ?? [];
    expect(rowMatches.length).toBe(5);
  });
});

describe('POST /settings/inspiration', () => {
  it('inserts a row and returns a <tr> fragment with the new value', async () => {
    const { body, headers } = formBody({
      kind: 'account',
      value: '@brand_new_handle',
      channel: 'tiktok',
      isActive: 'on',
    });
    const res = await app.request('/settings/inspiration', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(201);
    const html = await res.text();
    expect(html).toContain('@brand_new_handle');
    expect(html).toMatch(/data-testid="inspiration-row-/);
  });

  it('returns 400 with a Zod-readable error for an invalid channel', async () => {
    const { body, headers } = formBody({
      kind: 'account',
      value: '@bad_channel',
      channel: 'twitter',
      isActive: 'on',
    });
    const res = await app.request('/settings/inspiration', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/Channel must be tiktok or youtube/i);
  });
});

describe('PUT /settings/inspiration/:id', () => {
  it('updates the value and returns the updated <tr> fragment', async () => {
    const id = firstInspirationId(ctx.db);
    const { body, headers } = formBody({
      kind: 'keyword_search',
      value: 'updated search phrase',
      channel: 'youtube',
      isActive: 'on',
    });
    const res = await app.request(`/settings/inspiration/${id}`, {
      method: 'PUT',
      headers,
      body,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('updated search phrase');
    expect(html).toContain(`inspiration-row-${id}`);
  });
});

describe('DELETE /settings/inspiration/:id', () => {
  it('soft-deletes (is_active=false) and the row is no longer rendered on next GET', async () => {
    const id = firstInspirationId(ctx.db);
    const res = await app.request(`/settings/inspiration/${id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const row = ctx.db
      .select()
      .from(inspirationSources)
      .where(eq(inspirationSources.id, id))
      .get();
    expect(row).toBeDefined();
    expect(row!.isActive).toBe(false);

    const list = await app.request('/settings/inspiration');
    const html = await list.text();
    expect(html).not.toContain(`inspiration-row-${id}`);
  });
});
