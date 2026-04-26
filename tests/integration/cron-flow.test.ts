import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { runSeed } from '../../scripts/seed.js';
import { activities, competitors, pollRuns } from '../../src/db/schema.js';
import { createDashboardRoute } from '../../src/routes/dashboard.js';
import { createJobsRoute } from '../../src/routes/jobs.js';
import { CRON_SECRET_HEADER } from '../../src/middleware/cron-secret.js';
import { env } from '../../src/lib/env.js';
import { SOTA_MODEL } from '../../src/services/llm-summarizer.js';
import { createTestDb, type TestDb } from '../helpers/db.js';

let ctx: ReturnType<typeof createTestDb>;
let app: Hono;

const TEST_SECRET = env.CRON_SECRET;

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  ctx.db.delete(activities).run();
  ctx.db.delete(pollRuns).run();

  app = new Hono();
  app.route('/jobs', createJobsRoute(ctx.db));
  app.route('/', createDashboardRoute(ctx.db));

  // Stub OpenRouter so the LLM summarizer doesn't try to hit the network.
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          id: 'gen-cron-1',
          model: SOTA_MODEL,
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  summary: 'cron-flow summary',
                  themes: ['cron'],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );
});

afterEach(() => {
  ctx.sqlite.close();
  vi.restoreAllMocks();
});

function pickCompetitorId(db: TestDb): string {
  const row = db.select({ id: competitors.id }).from(competitors).get();
  if (!row) throw new Error('no competitor seeded');
  return row.id;
}

describe('cron-flow integration', () => {
  it('POST /jobs/poll/daily with valid secret runs all daily pollers and returns costs', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const res = await app.request('/jobs/poll/daily', {
      method: 'POST',
      headers: { [CRON_SECRET_HEADER]: TEST_SECRET },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: Array<{ channel: string; costUsdEst: number }>;
      total_items: number;
      total_inserted: number;
      total_cost: number;
    };
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs.length).toBeGreaterThan(0);
    // Cost field is present and numeric on every run
    for (const r of body.runs) {
      expect(typeof r.costUsdEst).toBe('number');
    }
    expect(typeof body.total_cost).toBe('number');
    expect(body.total_inserted).toBeGreaterThan(0);
    delete process.env.OPENROUTER_API_KEY;
  });

  it('dashboard /: with a competitor flagged degraded_channels, an amber banner is rendered', async () => {
    const cId = pickCompetitorId(ctx.db);
    ctx.db
      .update(competitors)
      .set({ degradedChannels: ['website'] })
      .where(eq(competitors.id, cId))
      .run();

    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="banner-degraded"');
    expect(html).toContain('Degraded channels');
  });
});
