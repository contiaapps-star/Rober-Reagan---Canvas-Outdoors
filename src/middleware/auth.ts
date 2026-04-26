import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';

import { getDb, type Db } from '../db/client.js';
import { users, type User } from '../db/schema.js';
import { SESSION_COOKIE_NAME, verifySession } from '../lib/auth.js';
import type { AppEnv, AuthedUser } from '../lib/types.js';

export type { AuthedUser };

function loadUser(db: Db, uid: string): AuthedUser | null {
  const row = db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, uid))
    .get() as Pick<User, 'id' | 'email' | 'role'> | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, role: row.role };
}

export function createRequireAuth(db: Db = getDb()): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const cookie = getCookie(c, SESSION_COOKIE_NAME);
    const payload = cookie ? verifySession(cookie) : null;
    const user = payload ? loadUser(db, payload.uid) : null;
    if (!user) {
      // For htmx/AJAX requests reply with 401 + HX-Redirect so the client
      // navigates without doing a body swap. For full-page navigations do a
      // 302 redirect.
      const wantsHtmx = c.req.header('HX-Request') === 'true';
      const accept = c.req.header('accept') ?? '';
      if (wantsHtmx) {
        c.header('HX-Redirect', '/auth/login');
        return c.body(null, 401);
      }
      if (accept.includes('application/json')) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      const qs = c.req.url.split('?')[1];
      const target = c.req.path + (qs ? `?${qs}` : '');
      const nextParam = encodeURIComponent(target);
      return c.redirect(`/auth/login?next=${nextParam}`, 302);
    }
    c.set('user', user);
    return next();
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = (c, next) =>
  createRequireAuth(getDb())(c, next);

export function requireRole(
  role: 'admin' | 'agency',
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (user.role !== role) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    return next();
  };
}
