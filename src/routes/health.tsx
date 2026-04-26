import { Hono } from 'hono';

import { pingDb, type Db } from '../db/client.js';
import { getHealthCards } from '../db/queries.js';
import { env } from '../lib/env.js';
import { getMonthSpendUsd } from '../middleware/budget-guard.js';
import { HealthView } from '../views/health/index.js';

export function createHealthRoute(db: Db): Hono {
  const app = new Hono();

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

  app.get('/channels', (c) => {
    const nowUnix = Math.floor(Date.now() / 1000);
    const cards = getHealthCards(db, nowUnix);
    const monthlySpendUsd = getMonthSpendUsd(db);
    return c.html(
      <HealthView
        cards={cards}
        monthlySpendUsd={monthlySpendUsd}
        monthlyBudgetUsd={env.MONTHLY_BUDGET_USD}
        nowUnix={nowUnix}
      />,
    );
  });

  return app;
}

import { getDb } from '../db/client.js';
export const healthRoute: Hono = createHealthRoute(getDb());
