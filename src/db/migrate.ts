import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';

import { logger } from '../lib/logger.js';
import { getDb } from './client.js';

function resolveMigrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dev (tsx watch): src/db/migrate.ts → src/db/migrations
  // prod (compiled): dist/db/migrate.js → dist/db/migrations (copied at build)
  const candidates = [
    path.resolve(here, 'migrations'),
    path.resolve(here, '../../src/db/migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
    path.resolve(process.cwd(), 'dist/db/migrations'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, 'meta'))) {
      return c;
    }
  }
  // Fallback to first candidate (drizzle will throw a clear error if missing).
  return candidates[0]!;
}

export function runMigrations(): void {
  const folder = resolveMigrationsFolder();
  const start = Date.now();
  try {
    drizzleMigrate(getDb(), { migrationsFolder: folder });
    logger.info(
      { folder, ms: Date.now() - start },
      'migrations applied',
    );
  } catch (err) {
    logger.error({ err, folder }, 'migration failed');
    throw err;
  }
}
