import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

import type { RequestHandler } from 'msw';

export type MswServer = ReturnType<typeof setupServer>;

export function startMswServer(handlers: RequestHandler[] = []): MswServer {
  const server = setupServer(...handlers);
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  return server;
}

export function withLiveMode(): void {
  // Switch process.env.OPERATION_MODE between tests. The pollers read this
  // at call time via demo-helpers.isDemo(); env.ts is unaffected.
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.OPERATION_MODE;
    process.env.OPERATION_MODE = 'live';
  });
  afterEach(() => {
    if (previous === undefined) {
      delete process.env.OPERATION_MODE;
    } else {
      process.env.OPERATION_MODE = previous;
    }
  });
}
