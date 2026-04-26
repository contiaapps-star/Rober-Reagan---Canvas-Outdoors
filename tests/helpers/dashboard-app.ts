import { Hono } from 'hono';

import { createDashboardRoute } from '../../src/routes/dashboard.js';
import type { TestDb } from './db.js';

export function buildDashboardApp(db: TestDb): Hono {
  const app = new Hono();
  app.route('/', createDashboardRoute(db));
  return app;
}
