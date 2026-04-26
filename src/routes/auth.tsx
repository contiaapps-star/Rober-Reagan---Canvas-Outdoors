import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';

import { getDb, type Db } from '../db/client.js';
import { users } from '../db/schema.js';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSession,
  verifyPassword,
} from '../lib/auth.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../lib/types.js';
import { LoginView } from '../views/auth/login.js';

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1),
  next: z.string().optional(),
});

function setSessionCookie(
  c: import('hono').Context,
  uid: string,
): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const value = signSession({ uid, exp });
  setCookie(c, SESSION_COOKIE_NAME, value, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS,
  });
}

function clearSessionCookie(c: import('hono').Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}

function safeNext(raw: string | undefined): string {
  if (!raw) return '/';
  try {
    const decoded = decodeURIComponent(raw);
    // Only allow same-origin paths
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/';
    if (decoded.startsWith('/auth/')) return '/';
    return decoded;
  } catch {
    return '/';
  }
}

export function createAuthRoute(db: Db): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/login', (c) => {
    const next = c.req.query('next');
    return c.html(<LoginView next={next ? decodeURIComponent(next) : undefined} />);
  });

  app.post('/login', async (c) => {
    const ct = c.req.header('content-type') ?? '';
    let raw: Record<string, string> = {};
    if (ct.includes('application/json')) {
      try {
        raw = (await c.req.json()) as Record<string, string>;
      } catch {
        raw = {};
      }
    } else {
      const form = await c.req.formData();
      form.forEach((v, k) => {
        if (typeof v === 'string') raw[k] = v;
      });
    }
    const next = c.req.query('next') ?? raw.next;
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return c.html(
        <LoginView
          error="Enter a valid email and password."
          email={typeof raw.email === 'string' ? raw.email : ''}
          next={next}
        />,
        401,
      );
    }

    const row = db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .get();

    if (!row) {
      logger.warn(
        { email: parsed.data.email },
        'login failed: unknown email',
      );
      return c.html(
        <LoginView
          error="Invalid email or password."
          email={parsed.data.email}
          next={next}
        />,
        401,
      );
    }

    const ok = await verifyPassword(row.passwordHash, parsed.data.password);
    if (!ok) {
      logger.warn({ uid: row.id }, 'login failed: bad password');
      return c.html(
        <LoginView
          error="Invalid email or password."
          email={parsed.data.email}
          next={next}
        />,
        401,
      );
    }

    db.update(users)
      .set({ lastLoginAt: sql`(unixepoch())` })
      .where(eq(users.id, row.id))
      .run();

    setSessionCookie(c, row.id);
    logger.info({ uid: row.id, role: row.role }, 'login ok');
    return c.redirect(safeNext(next), 302);
  });

  app.post('/logout', (c) => {
    clearSessionCookie(c);
    return c.redirect('/auth/login', 302);
  });

  // The sidebar uses a plain <a href> for sign-out, so support GET too.
  app.get('/logout', (c) => {
    clearSessionCookie(c);
    return c.redirect('/auth/login', 302);
  });

  return app;
}

export const authRoute: Hono<AppEnv> = createAuthRoute(getDb());
