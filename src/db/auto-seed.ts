import { sql } from 'drizzle-orm';

import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { getDb } from './client.js';
import { competitors } from './schema.js';
import { runSeed, SeedAlreadyExistsError } from './seed.js';

export async function maybeAutoSeed(): Promise<void> {
  if (env.NODE_ENV === 'test') return;
  if (env.OPERATION_MODE !== 'demo') return;

  const db = getDb();
  const existing = db
    .select({ count: sql<number>`count(*)` })
    .from(competitors)
    .get();
  const hasData = (existing?.count ?? 0) > 0;
  if (hasData) {
    logger.info(
      { competitor_count: Number(existing?.count ?? 0) },
      'auto-seed skipped (db already populated)',
    );
    return;
  }

  try {
    const counts = await runSeed(db);
    logger.info({ counts }, 'auto-seed completed (demo mode, empty db)');
  } catch (err) {
    if (err instanceof SeedAlreadyExistsError) return;
    logger.error({ err }, 'auto-seed failed');
    throw err;
  }
}
