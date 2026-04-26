import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';

import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import type { AppEnv } from './lib/types.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRoute } from './routes/health.js';
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

app.use('/css/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));
app.get('/logo.svg', serveStatic({ path: './public/logo.svg' }));
app.get('/favicon.ico', (c) => c.body(null, 204));

app.route('/health', healthRoute);
app.route('/', dashboardRoute);
app.route('/settings', settingsRoute);
app.route('/jobs', jobsRoute);
app.route('/auth', authRoute);

if (env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
    logger.info(
      { port: info.port, mode: env.OPERATION_MODE, env: env.NODE_ENV },
      'flowcore marketing sensor listening',
    );
  });
}
