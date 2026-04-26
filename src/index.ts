import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';

import { maybeBootstrapAdmin } from './db/auto-bootstrap-admin.js';
import { maybeAutoSeed } from './db/auto-seed.js';
import { runMigrations } from './db/migrate.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import type { AppEnv } from './lib/types.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/auth.js';
import { healthPingRoute, createHealthRoute } from './routes/health.js';
import { getDb } from './db/client.js';
import { dashboardRoute } from './routes/dashboard.js';
import { settingsRoute } from './routes/settings.js';
import { jobsRoute } from './routes/jobs.js';
import { authRoute } from './routes/auth.js';

export const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', requestId);
  c.header('x-request-id', requestId);

  const start = Date.now();
  await next();

  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - start,
    },
    'request',
  );
});

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.use('/css/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));
app.get('/logo.svg', serveStatic({ path: './public/logo.svg' }));
// Browsers ask for /favicon.ico by default; we serve the SVG mark instead.
app.get('/favicon.ico', serveStatic({ path: './public/logo.svg' }));

// Public routes (no session required):
//  - GET /health (JSON) → uptime probe
//  - /auth/* → login / logout
//  - /jobs/* → cron-only, gated by X-Cron-Secret middleware inside the route
app.route('/health', healthPingRoute);
app.route('/auth', authRoute);
app.route('/jobs', jobsRoute);

// Protected (requires session cookie). Wrapped in a sub-app so the requireAuth
// middleware only runs for these routes regardless of registration order.
// /health/channels (HTML) and the admin /health/run-all + /health/retry/*
// actions also live here.
const protectedApp = new Hono<AppEnv>();
protectedApp.use('*', requireAuth);
protectedApp.route('/', dashboardRoute);
protectedApp.route('/settings', settingsRoute);
protectedApp.route('/health', createHealthRoute(getDb()));
app.route('/', protectedApp);

if (env.NODE_ENV !== 'test') {
  void bootstrap();
}

async function bootstrap() {
  try {
    runMigrations();
    await maybeAutoSeed();
    await maybeBootstrapAdmin();
  } catch (err) {
    logger.fatal(
      { err },
      'boot tasks failed — aborting before opening the HTTP port',
    );
    process.exit(1);
  }

  serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
    logger.info(
      { port: info.port, mode: env.OPERATION_MODE, env: env.NODE_ENV },
      'flowcore marketing sensor listening',
    );
  });
}
