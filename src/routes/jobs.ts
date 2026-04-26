import { Hono } from 'hono';

import type { Db } from '../db/client.js';
import { cronSecret } from '../middleware/cron-secret.js';
import {
  runChannelPoll,
  runDailyPoll,
  runWeeklyPoll,
  type OrchestratorSummary,
} from '../services/polling-orchestrator.js';

function summaryToJson(summary: OrchestratorSummary): Record<string, unknown> {
  return {
    runs: summary.runs.map((r) => ({
      runId: r.runId,
      channel: r.channel,
      competitorId: r.competitorId,
      status: r.status,
      itemsFetched: r.itemsFetched,
      itemsInserted: r.itemsInserted,
      costUsdEst: Number(r.costUsdEst.toFixed(6)),
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
    })),
    total_items: summary.totalItems,
    total_inserted: summary.totalInserted,
    total_cost: Number(summary.totalCostUsd.toFixed(4)),
  };
}

export function createJobsRoute(db: Db): Hono {
  const app = new Hono();
  app.use('*', cronSecret);

  app.post('/poll/daily', async (c) => {
    const summary = await runDailyPoll({ db });
    return c.json(summaryToJson(summary), 200);
  });

  app.post('/poll/weekly', async (c) => {
    const summary = await runWeeklyPoll({ db });
    return c.json(summaryToJson(summary), 200);
  });

  app.post('/poll/:channel', async (c) => {
    const channel = c.req.param('channel');
    if (channel === 'daily' || channel === 'weekly') {
      // Already handled by the explicit routes above; defensively forbid here.
      return c.json({ error: 'use /poll/daily or /poll/weekly directly' }, 400);
    }
    try {
      const summary = await runChannelPoll({ db }, channel);
      return c.json(summaryToJson(summary), 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('Unknown poller channel')) {
        return c.json({ error: msg }, 404);
      }
      throw err;
    }
  });

  return app;
}

import { getDb } from '../db/client.js';
export const jobsRoute: Hono = createJobsRoute(getDb());
