import { Hono } from 'hono';

import { createSettingsRoute } from '../../src/routes/settings.js';
import type { TestDb } from './db.js';

export function buildSettingsApp(db: TestDb): Hono {
  const app = new Hono();
  app.route('/settings', createSettingsRoute(db));
  return app;
}

export function formBody(values: Record<string, string>): {
  body: string;
  headers: Record<string, string>;
} {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) params.append(k, v);
  return {
    body: params.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  };
}
