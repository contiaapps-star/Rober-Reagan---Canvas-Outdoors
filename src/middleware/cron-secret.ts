import type { MiddlewareHandler } from 'hono';

import { env } from '../lib/env.js';

export const CRON_SECRET_HEADER = 'X-Cron-Secret';

export const cronSecret: MiddlewareHandler = async (c, next) => {
  const provided = c.req.header(CRON_SECRET_HEADER) ?? '';
  if (!provided || provided !== env.CRON_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};
