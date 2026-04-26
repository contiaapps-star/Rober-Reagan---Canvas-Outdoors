import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';

import { runSeed } from '../../scripts/seed.js';
import { activities, pollRuns } from '../../src/db/schema.js';
import { createJobsRoute } from '../../src/routes/jobs.js';
import { CRON_SECRET_HEADER } from '../../src/middleware/cron-secret.js';
import { env } from '../../src/lib/env.js';
import { SOTA_MODEL } from '../../src/services/llm-summarizer.js';
import { createTestDb } from '../helpers/db.js';

let ctx: ReturnType<typeof createTestDb>;
let app: Hono;

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  ctx.db.delete(activities).run();
  ctx.db.delete(pollRuns).run();
  app = createJobsRoute(ctx.db);

  // Stub global fetch so the LLM call inside the orchestrator returns a clean
  // mocked JSON. The route doesn't expose llm injection, so we do it globally.
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          id: 'gen-route-1',
          model: SOTA_MODEL,
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  summary: 'route-test summary',
                  themes: ['route-test'],
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

// Read whatever env.CRON_SECRET resolved to under the docker test container —
// docker-compose's env_file may have set it to a real value before vitest's
// setup-env defaults could fire.
const TEST_SECRET = env.CRON_SECRET;

describe('POST /jobs/poll/*', () => {
  it('returns 401 when X-Cron-Secret is missing', async () => {
    const res = await app.request('/poll/daily', { method: 'POST' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('returns 200 + summary JSON when X-Cron-Secret is valid', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const res = await app.request('/poll/daily', {
      method: 'POST',
      headers: { [CRON_SECRET_HEADER]: TEST_SECRET },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: unknown[];
      total_items: number;
      total_inserted: number;
      total_cost: number;
    };
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs.length).toBeGreaterThan(0);
    expect(typeof body.total_items).toBe('number');
    expect(typeof body.total_inserted).toBe('number');
    expect(body.total_inserted).toBeGreaterThan(0);
    expect(typeof body.total_cost).toBe('number');
    delete process.env.OPENROUTER_API_KEY;
  });

  it('POST /jobs/poll/website with valid secret runs only the website channel', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    const res = await app.request('/poll/website', {
      method: 'POST',
      headers: { [CRON_SECRET_HEADER]: TEST_SECRET },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs: Array<{ channel: string }>;
    };
    expect(body.runs.length).toBeGreaterThan(0);
    for (const r of body.runs) {
      expect(r.channel).toBe('website');
    }

    // poll_runs in the DB should only have website rows.
    const allRuns = ctx.db.select().from(pollRuns).all();
    expect(allRuns.length).toBe(body.runs.length);
    for (const r of allRuns) expect(r.channel).toBe('website');
    delete process.env.OPENROUTER_API_KEY;
  });
});
