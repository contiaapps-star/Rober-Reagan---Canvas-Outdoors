import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSeed } from '../../scripts/seed.js';
import { competitors } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { buildSettingsApp, formBody } from '../helpers/settings-app.js';
import type { Hono } from 'hono';

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

function firstCompetitorId(db: TestDb): string {
  const row = db.select({ id: competitors.id }).from(competitors).get();
  if (!row) throw new Error('no competitor seeded');
  return row.id;
}

describe('GET /settings/competitors', () => {
  it('returns 200 with HTML containing "Competitors" and 22 rows', async () => {
    const res = await app.request('/settings/competitors');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Competitors');
    const rowMatches = html.match(/data-testid="competitor-row-/g) ?? [];
    expect(rowMatches.length).toBe(22);
  });
});

describe('POST /settings/competitors', () => {
  it('inserts a row and returns a <tr> fragment with the new name and domain', async () => {
    const { body, headers } = formBody({
      name: 'New Test Competitor',
      domain: 'newtestcompetitor.example',
      category: 'plumbing',
      tier: 'local_same_size',
      handle_meta_facebook: 'newtestfb',
    });
    const res = await app.request('/settings/competitors', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(201);
    const html = await res.text();
    expect(html).toMatch(/<tr[^>]*data-testid="competitor-row-/);
    expect(html).toContain('New Test Competitor');
    expect(html).toContain('newtestcompetitor.example');
  });

  it('returns 400 with "Domain already exists" when the domain is taken', async () => {
    const existing = ctx.db.select().from(competitors).get();
    if (!existing) throw new Error('no competitor seeded');
    const { body, headers } = formBody({
      name: 'Conflicting Name',
      domain: existing.domain,
      category: 'plumbing',
      tier: 'local_same_size',
    });
    const res = await app.request('/settings/competitors', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Domain already exists');
    expect(html).toContain('competitor-form');
  });

  it('returns 400 with a Zod-readable error for an invalid category', async () => {
    const { body, headers } = formBody({
      name: 'Bad Cat',
      domain: 'badcat-unique.example',
      category: 'invalid',
      tier: 'local_same_size',
    });
    const res = await app.request('/settings/competitors', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/Category must be well, plumbing, or both/i);
  });

  it('returns 400 with "Invalid domain" for a malformed domain', async () => {
    const { body, headers } = formBody({
      name: 'Bad Domain',
      domain: 'not-a-domain',
      category: 'plumbing',
      tier: 'local_same_size',
    });
    const res = await app.request('/settings/competitors', {
      method: 'POST',
      headers,
      body,
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/Invalid domain/i);
  });
});

describe('PUT /settings/competitors/:id', () => {
  it('updates the name and returns the updated <tr> fragment', async () => {
    const id = firstCompetitorId(ctx.db);
    const { body, headers } = formBody({
      name: 'Renamed Competitor',
      domain: 'renamed-competitor.example',
      category: 'both',
      tier: 'mondo_100m',
    });
    const res = await app.request(`/settings/competitors/${id}`, {
      method: 'PUT',
      headers,
      body,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Renamed Competitor');
    expect(html).toContain(`competitor-row-${id}`);
  });
});

describe('DELETE /settings/competitors/:id', () => {
  it('soft-deletes (is_active=false) and the row is no longer rendered on next GET', async () => {
    const id = firstCompetitorId(ctx.db);
    const res = await app.request(`/settings/competitors/${id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const row = ctx.db
      .select()
      .from(competitors)
      .where(eq(competitors.id, id))
      .get();
    expect(row).toBeDefined();
    expect(row!.isActive).toBe(false);

    const list = await app.request('/settings/competitors');
    const html = await list.text();
    expect(html).not.toContain(`competitor-row-${id}`);
  });
});

describe('GET /settings/competitors/:id/edit', () => {
  it('returns 404 for a non-existent id', async () => {
    const res = await app.request(
      '/settings/competitors/00000000-0000-0000-0000-000000000000/edit',
    );
    expect(res.status).toBe(404);
  });
});
