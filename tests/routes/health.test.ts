import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';

import { runSeed } from '../../scripts/seed.js';
import { createHealthRoute } from '../../src/routes/health.js';
import {
  apiSpendLog,
  competitors,
  pollRuns,
  type Competitor,
} from '../../src/db/schema.js';
import { createTestDb, type TestDb } from '../helpers/db.js';

let ctx: ReturnType<typeof createTestDb>;
let app: Hono;

function buildHealthApp(db: TestDb): Hono {
  const a = new Hono();
  // Simulate an authenticated admin so the admin-only "Retry now" / "Run all"
  // buttons render in the health view (Phase 7 gates them on user.role).
  a.use('*', async (c, next) => {
    c.set('user', {
      id: 'test-admin',
      email: 'test-admin@flowcorewater.test',
      role: 'admin',
    });
    return next();
  });
  a.route('/health', createHealthRoute(db));
  return a;
}

function pickCompetitor(db: TestDb): Competitor {
  const row = db.select().from(competitors).get();
  if (!row) throw new Error('no competitor seeded');
  return row;
}

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  // Wipe any pre-existing poll_runs so we control what the health view sees.
  ctx.db.delete(pollRuns).run();
  app = buildHealthApp(ctx.db);
});

afterEach(() => {
  ctx.sqlite.close();
});

describe('GET /health/channels', () => {
  it('renders a grid with 1 card per channel × competitor active', async () => {
    const res = await app.request('/health/channels');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="health-grid"');

    // The seed creates ~15 active competitors and each gets at least website +
    // seo_ranking + seo_backlink. So ≥ 3 cards × competitors total. We only
    // assert that the grid contains many cards.
    const cardMatches = html.match(/data-testid="health-card-/g) ?? [];
    expect(cardMatches.length).toBeGreaterThan(10);
  });

  it('shows a red border + Retry button for a failed-channel card older than 24h', async () => {
    const comp = pickCompetitor(ctx.db);
    const moreThan24hAgo = Math.floor(Date.now() / 1000) - 30 * 3600;
    ctx.db
      .insert(pollRuns)
      .values({
        id: randomUUID(),
        channel: 'website',
        competitorId: comp.id,
        startedAt: moreThan24hAgo,
        finishedAt: moreThan24hAgo + 5,
        status: 'failed',
        errorMessage: 'simulated downstream timeout',
        itemsFetched: 0,
        costUsdEstimated: 0,
      })
      .run();

    const res = await app.request('/health/channels');
    expect(res.status).toBe(200);
    const html = await res.text();

    // Find the specific card for this competitor + channel
    const cardId = `health-card-website-${comp.id}`;
    expect(html).toContain(`data-testid="${cardId}"`);
    // It must be in red state
    const cardRe = new RegExp(
      `data-testid="${cardId}"[^>]*data-state="(red|amber|green)"`,
    );
    const m = html.match(cardRe);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('red');
    // Retry button must be there
    expect(html).toContain(`data-testid="retry-website-${comp.id}"`);
    // Error message surfaced
    expect(html).toContain('simulated downstream timeout');
  });

  it('renders the API-spend KPI tile with current month total and cap', async () => {
    // Seed adds spend rows for the current month — confirm those are included.
    const month = new Date().toISOString().slice(0, 7);
    ctx.db.delete(apiSpendLog).run();
    // $123.45 spent in the current month from apify alone
    ctx.db
      .insert(apiSpendLog)
      .values({
        id: randomUUID(),
        provider: 'apify',
        month,
        spendUsd: 12345,
      })
      .run();

    const res = await app.request('/health/channels');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="kpi-spend-tile"');
    expect(html).toContain('data-testid="spend-amount"');
    expect(html).toContain('$123.45');
    expect(html).toContain('$200.00');
    // Progress bar present
    expect(html).toContain('data-testid="spend-bar-fill"');
  });
});
