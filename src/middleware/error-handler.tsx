import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../lib/types.js';
import { ErrorView } from '../views/error.js';

const HTTP_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

function wantsJson(c: import('hono').Context): boolean {
  if (c.req.path.startsWith('/jobs/')) return true;
  if (c.req.path.startsWith('/api/')) return true;
  const accept = c.req.header('accept') ?? '';
  if (accept.includes('application/json') && !accept.includes('text/html')) {
    return true;
  }
  return false;
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId');
  const isDev = env.NODE_ENV !== 'production';

  if (err instanceof HTTPException) {
    const status = err.status;
    const message =
      err.message || HTTP_STATUS_TEXT[status] || 'Request failed.';
    logger.warn({ requestId, status, message }, 'http exception');
    if (wantsJson(c)) {
      return c.json({ error: message, requestId }, status);
    }
    return c.html(
      <ErrorView
        status={status}
        title={HTTP_STATUS_TEXT[status] ?? 'Error'}
        message={message}
        requestId={requestId}
      />,
      status,
    );
  }

  logger.error({ requestId, err }, 'unhandled error');
  const stack = err instanceof Error ? err.stack ?? null : null;

  if (wantsJson(c)) {
    return c.json(
      {
        error: 'Internal Server Error',
        requestId,
        ...(isDev && stack ? { stack } : {}),
      },
      500,
    );
  }
  return c.html(
    <ErrorView
      status={500}
      title="Internal Server Error"
      message="Something went wrong on our end. The team has been notified — try again, or share the request id below if the problem persists."
      requestId={requestId}
      stack={isDev ? stack : null}
    />,
    500,
  );
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
  const requestId = c.get('requestId');
  logger.info({ requestId, path: c.req.path }, 'not found');
  if (wantsJson(c)) {
    return c.json({ error: 'Not Found', requestId }, 404);
  }
  return c.html(
    <ErrorView
      status={404}
      title="Not Found"
      message={`We can't find ${c.req.path}.`}
      requestId={requestId}
    />,
    404,
  );
};
