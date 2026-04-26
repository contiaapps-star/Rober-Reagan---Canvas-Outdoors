import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { hashPassword } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { getDb } from './client.js';
import { users } from './schema.js';

// Idempotently bootstraps an admin user from env vars on boot.
// Triggered by BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD. Used for:
//   - First Railway deploy (operator sets the vars once, removes them after)
//   - E2E test container (docker-compose.test.yml sets them so Playwright
//     has working credentials).
// If the user already exists, the password+role are updated.
export async function maybeBootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;

  const normalized = email.toLowerCase();
  const passwordHash = await hashPassword(password);
  const db = getDb();

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .get();

  if (existing) {
    db.update(users)
      .set({ passwordHash, role: 'admin' })
      .where(eq(users.id, existing.id))
      .run();
    logger.info({ email: normalized }, 'bootstrap-admin: existing user reset');
  } else {
    db.insert(users)
      .values({
        id: randomUUID(),
        email: normalized,
        passwordHash,
        role: 'admin',
      })
      .run();
    logger.info({ email: normalized }, 'bootstrap-admin: new admin created');
  }
}
