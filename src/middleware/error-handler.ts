import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof HTTPException) {
    logger.warn(
      { requestId, status: err.status, message: err.message },
      'http exception',
    );
    return c.json(
      { error: err.message, requestId },
      err.status,
    );
  }

  logger.error({ requestId, err }, 'unhandled error');
  return c.json(
    { error: 'Internal Server Error', requestId },
    500,
  );
};
