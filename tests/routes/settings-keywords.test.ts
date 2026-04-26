import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';

import { runSeed } from '../../scripts/seed.js';
import { targetKeywords } from '../../src/db/schema.js';
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

function firstKeywordId(db: TestDb): string {
  const row = db.select({ id: targetKeywords.id }).from(targetKeywords).get();
  if (!row) throw new Error('no keyword seeded');
  return row.id;
}

describe('GET /settings/keywords', () => {
  it('returns 200 with HTML containing "Target Keywords" and 15 rows', async () => {
    const res = await app.request('/settings/keywords');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Target Keywords');
    const rowMatches = html.match(/data-testid="keyword-row-/g) ?? [];
    expect(rowMatches.length).toBe(15);
  });
});

describe('POST /settings/keywords', () => {
  it('inserts a row and returns a <tr> fragment with the new keyword', async () => {
    const { body, headers } = formBody({
      keyword: 'a brand new test keyword',
      category: 'plumbing',
      isActive: 'on',
    });
    const res = await app.request('/settings/keywords', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(201);
    const html = await res.text();
    expect(html).toContain('a brand new test keyword');
    expect(html).toMatch(/data-testid="keyword-row-/);
  });

  it('returns 400 with a Zod-readable error for an invalid category', async () => {
    const { body, headers } = formBody({
      keyword: 'kw with bad cat',
      category: 'xyz',
      isActive: 'on',
    });
    const res = await app.request('/settings/keywords', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/Category must be well, plumbing, or both/i);
  });
});

describe('PUT /settings/keywords/:id', () => {
  it('updates the keyword and returns the updated <tr> fragment', async () => {
    const id = firstKeywordId(ctx.db);
    const { body, headers } = formBody({
      keyword: 'renamed keyword phrase',
      category: 'both',
      isActive: 'on',
    });
    const res = await app.request(`/settings/keywords/${id}`, {
      method: 'PUT',
      headers,
      body,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('renamed keyword phrase');
    expect(html).toContain(`keyword-row-${id}`);
  });
});

describe('DELETE /settings/keywords/:id', () => {
  it('soft-deletes (is_active=false) and the row is no longer rendered on next GET', async () => {
    const id = firstKeywordId(ctx.db);
    const res = await app.request(`/settings/keywords/${id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const row = ctx.db
      .select()
      .from(targetKeywords)
      .where(eq(targetKeywords.id, id))
      .get();
    expect(row).toBeDefined();
    expect(row!.isActive).toBe(false);

    const list = await app.request('/settings/keywords');
    const html = await list.text();
    expect(html).not.toContain(`keyword-row-${id}`);
  });
});
