import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js';
import type { AppEnv } from '../../src/lib/types.js';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'req-test-1234');
    await next();
  });
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  return app;
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.resetModules();
});

// ─── Production-mode: 500 must NOT leak the stack trace ───────────────────────

describe('errorHandler in production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();
  });

  it('returns HTML 500 with no stack trace exposed for browser requests', async () => {
    // Re-import the module so it picks up NODE_ENV=production
    const mod = await import('../../src/middleware/error-handler.js');
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req-prod-1');
      await next();
    });
    app.onError(mod.errorHandler);
    app.notFound(mod.notFoundHandler);
    app.get('/boom', () => {
      const e = new Error('SECRET STACK MARKER xyz123');
      throw e;
    });

    const res = await app.request('/boom', { headers: { accept: 'text/html' } });
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type') ?? '').toMatch(/html/i);
    const html = await res.text();
    expect(html).toContain('500');
    expect(html).toContain('Internal Server Error');
    // No stack trace (no <details data-testid="error-stack">), no marker
    expect(html).not.toContain('SECRET STACK MARKER xyz123');
    expect(html).not.toContain('error-stack');
  });

  it('does not include `stack` in JSON 500 response', async () => {
    const mod = await import('../../src/middleware/error-handler.js');
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req-prod-2');
      await next();
    });
    app.onError(mod.errorHandler);
    app.get('/jobs/boom', () => {
      throw new Error('JSON STACK MARKER xyz123');
    });

    const res = await app.request('/jobs/boom');
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type') ?? '').toMatch(/json/i);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Internal Server Error');
    expect(body.stack).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('JSON STACK MARKER');
  });
});

// ─── Development-mode: 500 must include the stack trace ───────────────────────

describe('errorHandler in development', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();
  });

  it('renders the stack trace inside the HTML response', async () => {
    const mod = await import('../../src/middleware/error-handler.js');
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req-dev-1');
      await next();
    });
    app.onError(mod.errorHandler);
    app.get('/boom', () => {
      throw new Error('DEV STACK MARKER abc456');
    });

    const res = await app.request('/boom', { headers: { accept: 'text/html' } });
    expect(res.status).toBe(500);
    const html = await res.text();
    expect(html).toContain('error-stack');
    expect(html).toContain('DEV STACK MARKER abc456');
  });

  it('exposes stack in JSON for /jobs/* routes in dev', async () => {
    const mod = await import('../../src/middleware/error-handler.js');
    const app = new Hono<AppEnv>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'req-dev-2');
      await next();
    });
    app.onError(mod.errorHandler);
    app.get('/jobs/boom', () => {
      throw new Error('DEV JSON MARKER def789');
    });

    const res = await app.request('/jobs/boom');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.stack).toBeDefined();
    expect(String(body.stack)).toContain('DEV JSON MARKER def789');
  });
});

// ─── HTTPException handling ──────────────────────────────────────────────────

describe('errorHandler with HTTPException', () => {
  it('returns the same status and message as the thrown HTTPException', async () => {
    const app = buildApp();
    app.get('/forbidden', () => {
      throw new HTTPException(403, { message: 'No access for you' });
    });

    const res = await app.request('/forbidden', { headers: { accept: 'text/html' } });
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain('403');
    expect(html).toContain('No access for you');
  });

  it('replies JSON for /jobs/* paths', async () => {
    const app = buildApp();
    app.get('/jobs/forbidden', () => {
      throw new HTTPException(403, { message: 'Cron secret missing' });
    });
    const res = await app.request('/jobs/forbidden');
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Cron secret missing');
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

describe('notFoundHandler', () => {
  it('renders the custom 404 page for HTML requests', async () => {
    const app = buildApp();
    const res = await app.request('/does-not-exist', {
      headers: { accept: 'text/html' },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type') ?? '').toMatch(/html/i);
    const html = await res.text();
    expect(html).toContain('404');
    expect(html).toContain('/does-not-exist');
  });

  it('returns JSON 404 for /jobs/*', async () => {
    const app = buildApp();
    const res = await app.request('/jobs/whatever');
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('Not Found');
  });
});
