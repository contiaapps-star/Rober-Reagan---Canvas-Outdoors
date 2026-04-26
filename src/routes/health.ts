import { Hono } from 'hono';
import { env } from '../lib/env.js';
import { pingDb } from '../db/client.js';

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  const db = pingDb();

  const body = {
    status: db.ok ? 'ok' : 'degraded',
    mode: env.OPERATION_MODE,
    db,
    uptime_s: Math.round(process.uptime()),
    node_env: env.NODE_ENV,
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  };

  return c.json(body, db.ok ? 200 : 503);
});
