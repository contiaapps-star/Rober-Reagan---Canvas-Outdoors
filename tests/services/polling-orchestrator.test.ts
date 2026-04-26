import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { runSeed } from '../../scripts/seed.js';
import { activities, pollRuns } from '../../src/db/schema.js';
import {
  ALL_POLLERS,
  DAILY_POLLERS,
  runDailyPoll,
  type OrchestratorOptions,
} from '../../src/services/polling-orchestrator.js';
import {
  FALLBACK_SUMMARY,
  SOTA_MODEL,
} from '../../src/services/llm-summarizer.js';
import type { Poller } from '../../src/pollers/base.js';
import { createTestDb } from '../helpers/db.js';

// A fetch impl that always returns a clean JSON LLM response.
function buildOkFetch() {
  return vi.fn().mockImplementation(async () => {
    return new Response(
      JSON.stringify({
        id: 'gen-1',
        model: SOTA_MODEL,
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({
                summary: 'Mocked LLM summary for orchestrator test.',
                themes: ['test', 'mocked'],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 30 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
}

let ctx: ReturnType<typeof createTestDb>;

beforeEach(async () => {
  // Clear the seed's pre-existing activities so we measure only what the
  // orchestrator inserts. We still want competitors seeded.
  ctx = createTestDb();
  await runSeed(ctx.db);
  ctx.db.delete(activities).run();
  ctx.db.delete(pollRuns).run();
});

afterEach(() => {
  ctx.sqlite.close();
  vi.restoreAllMocks();
});

function defaultOpts(): OrchestratorOptions {
  return {
    db: ctx.db,
    dateIso: '2026-04-25',
    pollerConcurrency: 2,
    summaryConcurrency: 2,
    llmOptions: {
      apiKey: 'test-key',
      fetchImpl: buildOkFetch() as unknown as typeof fetch,
      sleep: async () => undefined,
    },
  };
}

describe('polling-orchestrator', () => {
  it('inserts new activities, dedupes on second run, registers poll_runs', async () => {
    const first = await runDailyPoll(defaultOpts());
    expect(first.totalInserted).toBeGreaterThan(0);
    expect(first.totalItems).toBeGreaterThanOrEqual(first.totalInserted);

    const insertedAfterFirst = ctx.db.select().from(activities).all().length;
    expect(insertedAfterFirst).toBe(first.totalInserted);

    // Second run on the same date — every produced item should already exist
    // in the DB, so totalInserted on the second run is 0.
    const second = await runDailyPoll(defaultOpts());
    expect(second.totalInserted).toBe(0);
    const insertedAfterSecond = ctx.db.select().from(activities).all().length;
    expect(insertedAfterSecond).toBe(insertedAfterFirst);

    // Every run must produce a poll_runs row (one per poller × competitor).
    const runs = ctx.db.select().from(pollRuns).all();
    expect(runs.length).toBe(first.runs.length + second.runs.length);
    for (const r of runs) {
      expect(['ok', 'failed']).toContain(r.status);
      expect(typeof r.startedAt).toBe('number');
      expect(typeof r.finishedAt).toBe('number');
    }
  });

  it('a failing poller does NOT block the others — total_items > 0 and other channels still ran OK', async () => {
    const failingWebsite: Poller = {
      channel: 'website',
      poll: async () => {
        throw new Error('synthetic-website-failure');
      },
    };
    const opts: OrchestratorOptions = {
      ...defaultOpts(),
      pollers: {
        daily: [failingWebsite, ...DAILY_POLLERS.filter((p) => p.channel !== 'website')],
      },
    };

    const summary = await runDailyPoll(opts);
    expect(summary.totalItems).toBeGreaterThan(0);

    // poll_runs for 'website' are all failed, but the other channels should
    // have OK rows.
    const websiteRuns = ctx.db
      .select()
      .from(pollRuns)
      .where(eq(pollRuns.channel, 'website'))
      .all();
    expect(websiteRuns.length).toBeGreaterThan(0);
    for (const r of websiteRuns) {
      expect(r.status).toBe('failed');
      expect(r.errorMessage).toMatch(/synthetic-website-failure/);
    }

    const otherChannels = DAILY_POLLERS.filter((p) => p.channel !== 'website').map(
      (p) => p.channel,
    );
    const otherRuns = ctx.db
      .select()
      .from(pollRuns)
      .where(inArray(pollRuns.channel, otherChannels))
      .all();
    expect(otherRuns.length).toBeGreaterThan(0);
    expect(otherRuns.some((r) => r.status === 'ok')).toBe(true);
  });

  it('summary_text is filled (LLM-mocked) for every newly-inserted activity', async () => {
    const summary = await runDailyPoll(defaultOpts());
    expect(summary.totalInserted).toBeGreaterThan(0);

    const rows = ctx.db.select().from(activities).all();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.summaryText).not.toBeNull();
      expect(r.summaryText).not.toBe('');
      expect(r.summaryText).not.toBe(FALLBACK_SUMMARY);
      expect(r.summaryText).not.toMatch(/Pendiente generar/);
      expect(Array.isArray(r.themesExtracted)).toBe(true);
    }
  });

  it('all daily pollers report itemsFetched/itemsInserted matching DB writes', async () => {
    const summary = await runDailyPoll(defaultOpts());
    const totalFromRuns = summary.runs.reduce((acc, r) => acc + r.itemsInserted, 0);
    expect(totalFromRuns).toBe(summary.totalInserted);

    // Every channel referenced in runs should be one we recognize.
    const knownChannels = new Set(ALL_POLLERS.map((p) => p.channel));
    for (const r of summary.runs) {
      expect(knownChannels.has(r.channel)).toBe(true);
    }
  });
});
