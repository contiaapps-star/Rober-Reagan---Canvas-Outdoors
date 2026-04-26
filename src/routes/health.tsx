import { Hono } from 'hono';

import { pingDb, type Db } from '../db/client.js';
import { getHealthCards } from '../db/queries.js';
import { env } from '../lib/env.js';
import { flash } from '../lib/flash.js';
import type { AppEnv } from '../lib/types.js';
import { requireRole } from '../middleware/auth.js';
import { getMonthSpendUsd } from '../middleware/budget-guard.js';
import {
  runChannelPoll,
  runDailyPoll,
} from '../services/polling-orchestrator.js';
import { HealthView } from '../views/health/index.js';

// Public JSON probe used by Railway's healthcheck. Mounted at /health in index.
export function createHealthPingRoute(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get('/', (c) => {
    const dbStatus = pingDb();
    const body = {
      status: dbStatus.ok ? 'ok' : 'degraded',
      mode: env.OPERATION_MODE,
      db: dbStatus,
      uptime_s: Math.round(process.uptime()),
      node_env: env.NODE_ENV,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
    return c.json(body, dbStatus.ok ? 200 : 503);
  });
  return app;
}

// Channels view + admin run/retry actions. In production this is mounted
// under the requireAuth-gated sub-app. In tests it's mounted directly so unit
// tests can hit /health/channels without setting up sessions.
export function createHealthRoute(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Re-include the JSON ping so direct factory mounts in tests still get it.
  app.route('/', createHealthPingRoute());

  app.get('/channels', (c) => {
    const user = c.get('user');
    const nowUnix = Math.floor(Date.now() / 1000);
    const cards = getHealthCards(db, nowUnix);
    const monthlySpendUsd = getMonthSpendUsd(db);
    return c.html(
      <HealthView
        cards={cards}
        monthlySpendUsd={monthlySpendUsd}
        monthlyBudgetUsd={env.MONTHLY_BUDGET_USD}
        nowUnix={nowUnix}
        isAdmin={user?.role === 'admin'}
      />,
    );
  });

  // ─── Admin-only actions ──────────────────────────────────────────────────
  app.post('/run-all', requireRole('admin'), async (c) => {
    try {
      const summary = await runDailyPoll({ db });
      flash(
        c,
        'success',
        `Daily poll triggered — ${summary.totalInserted} new items across ${summary.runs.length} runs.`,
      );
    } catch (err) {
      flash(c, 'error', `Run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return c.redirect('/health/channels', 302);
  });

  app.post('/retry/:channel', requireRole('admin'), async (c) => {
    const channel = c.req.param('channel');
    try {
      const summary = await runChannelPoll({ db }, channel);
      flash(
        c,
        'success',
        `Retry queued for ${channel} — ${summary.totalInserted} new items.`,
      );
    } catch (err) {
      flash(c, 'error', `Retry failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return c.redirect('/health/channels', 302);
  });

  return app;
}

import { getDb } from '../db/client.js';
export const healthRoute: Hono<AppEnv> = createHealthRoute(getDb());
export const healthPingRoute: Hono<AppEnv> = createHealthPingRoute();
