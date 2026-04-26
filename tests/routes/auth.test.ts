import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';

import { users } from '../../src/db/schema.js';
import {
  SESSION_COOKIE_NAME,
  hashPassword,
  signSession,
} from '../../src/lib/auth.js';
import { createAuthRoute } from '../../src/routes/auth.js';
import { createDashboardRoute } from '../../src/routes/dashboard.js';
import {
  createRequireAuth,
  requireRole,
} from '../../src/middleware/auth.js';
import type { AppEnv } from '../../src/lib/types.js';
import { createTestDb, type TestDb } from '../helpers/db.js';
import { runSeed } from '../../scripts/seed.js';

let ctx: ReturnType<typeof createTestDb>;
let authApp: Hono<AppEnv>;
let user: { id: string; email: string; password: string };

async function insertUser(
  db: TestDb,
  email: string,
  password: string,
  role: 'admin' | 'agency' = 'admin',
): Promise<string> {
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  db.insert(users).values({ id, email: email.toLowerCase(), passwordHash, role }).run();
  return id;
}

function getCookieHeader(res: Response, name: string): string | null {
  const raw = res.headers.get('set-cookie');
  if (!raw) return null;
  const parts = raw.split(/,\s*(?=[^=;]+=)/);
  for (const p of parts) {
    if (p.startsWith(`${name}=`)) {
      return p.split(';')[0] ?? null;
    }
  }
  return null;
}

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  user = {
    id: '',
    email: 'auth-test-admin@flowcorewater.test',
    password: 'correct horse battery staple',
  };
  user.id = await insertUser(ctx.db, user.email, user.password, 'admin');
  authApp = new Hono<AppEnv>();
  authApp.route('/auth', createAuthRoute(ctx.db));
});

afterEach(() => {
  ctx.sqlite.close();
});

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('with correct credentials returns 302 and sets a session cookie', async () => {
    const form = new URLSearchParams({ email: user.email, password: user.password });
    const res = await authApp.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const cookie = getCookieHeader(res, SESSION_COOKIE_NAME);
    expect(cookie).not.toBeNull();
    expect(cookie!.includes('=')).toBe(true);
    expect(cookie!.length).toBeGreaterThan(SESSION_COOKIE_NAME.length + 5);
  });

  it('with wrong password returns 401 and renders the form with an error', async () => {
    const form = new URLSearchParams({ email: user.email, password: 'wrong' });
    const res = await authApp.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('data-testid="login-error"');
    expect(html).toContain('Invalid email or password');
    expect(getCookieHeader(res, SESSION_COOKIE_NAME)).toBeNull();
  });

  it('with unknown email returns 401', async () => {
    const form = new URLSearchParams({ email: 'nobody@example.com', password: 'x' });
    const res = await authApp.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    expect(res.status).toBe(401);
  });

  it('respects the next= param for safe same-origin redirects', async () => {
    const form = new URLSearchParams({ email: user.email, password: user.password });
    const res = await authApp.request('/auth/login?next=%2Fsettings%2Fcompetitors', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/settings/competitors');
  });

  it('rejects open-redirect attempts via next=', async () => {
    const form = new URLSearchParams({ email: user.email, password: user.password });
    const res = await authApp.request(
      '/auth/login?next=https%3A%2F%2Fevil.example.com',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('clears the session cookie and redirects to /auth/login', async () => {
    const res = await authApp.request('/auth/logout', { method: 'POST' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/auth/login');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });
});

// ─── requireAuth middleware ──────────────────────────────────────────────────

describe('requireAuth middleware', () => {
  function buildProtectedApp(db: TestDb): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.use('*', createRequireAuth(db));
    app.route('/', createDashboardRoute(db));
    return app;
  }

  it('redirects GET / to /auth/login when no session cookie is present', async () => {
    const app = buildProtectedApp(ctx.db);
    const res = await app.request('/');
    expect(res.status).toBe(302);
    const loc = res.headers.get('location') ?? '';
    expect(loc.startsWith('/auth/login')).toBe(true);
    expect(loc).toContain('next=');
  });

  it('redirects to /auth/login when the cookie HMAC is tampered', async () => {
    const valid = signSession({ uid: user.id, exp: Math.floor(Date.now() / 1000) + 3600 });
    // Flip the last char of the signature
    const tampered = valid.slice(0, -1) + (valid.slice(-1) === 'A' ? 'B' : 'A');
    const app = buildProtectedApp(ctx.db);
    const res = await app.request('/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tampered}` },
    });
    expect(res.status).toBe(302);
    expect((res.headers.get('location') ?? '').startsWith('/auth/login')).toBe(true);
  });

  it('passes through with a valid signed session cookie', async () => {
    const cookie = signSession({
      uid: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const app = buildProtectedApp(ctx.db);
    const res = await app.request('/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(200);
  });

  it('replies 401 with HX-Redirect header on htmx requests', async () => {
    const app = buildProtectedApp(ctx.db);
    const res = await app.request('/', { headers: { 'HX-Request': 'true' } });
    expect(res.status).toBe(401);
    expect(res.headers.get('HX-Redirect')).toBe('/auth/login');
  });
});

// ─── requireRole('admin') ────────────────────────────────────────────────────

describe("requireRole('admin')", () => {
  it('returns 403 when the authenticated user is role=agency', async () => {
    const agencyId = await insertUser(
      ctx.db,
      'agency@flowcorewater.com',
      'agency-pass-1',
      'agency',
    );
    const agencyCookie = signSession({
      uid: agencyId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const app = new Hono<AppEnv>();
    app.use('*', createRequireAuth(ctx.db));
    app.get('/admin-only', requireRole('admin'), (c) => c.text('admin'));

    const res = await app.request('/admin-only', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${agencyCookie}` },
    });
    expect(res.status).toBe(403);
  });

  it('lets admins through', async () => {
    const cookie = signSession({
      uid: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const app = new Hono<AppEnv>();
    app.use('*', createRequireAuth(ctx.db));
    app.get('/admin-only', requireRole('admin'), (c) => c.text('admin-ok'));
    const res = await app.request('/admin-only', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('admin-ok');
  });
});
