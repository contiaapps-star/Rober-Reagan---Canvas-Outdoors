import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activities,
  apiSpendLog,
  competitorHandles,
  competitors,
  inspirationSources,
  pollRuns,
  targetKeywords,
  users,
} from '../../src/db/schema.js';
import {
  SeedAlreadyExistsError,
  runSeed,
  type SeedCounts,
} from '../../scripts/seed.js';
import { createTestDb } from '../helpers/db.js';

function rowCount(
  db: ReturnType<typeof createTestDb>['db'],
  table:
    | typeof competitors
    | typeof competitorHandles
    | typeof targetKeywords
    | typeof inspirationSources
    | typeof activities
    | typeof pollRuns
    | typeof apiSpendLog
    | typeof users,
): number {
  const r = db.select({ count: sql<number>`count(*)` }).from(table).get();
  return Number(r?.count ?? 0);
}

describe('seed', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  it('is idempotent: second run without --force throws SeedAlreadyExistsError; --force resets and re-seeds', async () => {
    const { db } = ctx;
    await runSeed(db);
    await expect(runSeed(db)).rejects.toBeInstanceOf(SeedAlreadyExistsError);

    const beforeCount = rowCount(db, competitors);
    expect(beforeCount).toBe(22);

    const counts = await runSeed(db, { force: true });
    expect(counts.competitors).toBe(22);
    expect(rowCount(db, competitors)).toBe(22);
  });

  it('inserts the expected counts per table', async () => {
    const { db } = ctx;
    const counts: SeedCounts = await runSeed(db);

    expect(counts.competitors).toBe(22);
    expect(rowCount(db, competitors)).toBe(22);

    expect(counts.target_keywords).toBe(15);
    expect(rowCount(db, targetKeywords)).toBe(15);

    expect(counts.inspiration_sources).toBe(5);
    expect(rowCount(db, inspirationSources)).toBe(5);

    const activityCount = rowCount(db, activities);
    expect(activityCount).toBeGreaterThanOrEqual(80);
    expect(activityCount).toBeLessThanOrEqual(120);
    expect(counts.activities).toBe(activityCount);

    expect(rowCount(db, pollRuns)).toBe(5);
    expect(rowCount(db, apiSpendLog)).toBe(2);
    expect(rowCount(db, users)).toBe(1);
    expect(rowCount(db, competitorHandles)).toBeGreaterThanOrEqual(22 * 3);
  });

  it('distributes activity status approximately 70/20/10 (new/useful/skip) within ±10%', async () => {
    const { db } = ctx;
    await runSeed(db);

    const total = rowCount(db, activities);
    const buckets = db
      .select({
        status: activities.status,
        count: sql<number>`count(*)`,
      })
      .from(activities)
      .groupBy(activities.status)
      .all();

    const map = new Map<string, number>();
    for (const b of buckets) map.set(b.status, Number(b.count));

    const newRatio = (map.get('new') ?? 0) / total;
    const usefulRatio = (map.get('useful') ?? 0) / total;
    const skipRatio = (map.get('skip') ?? 0) / total;

    expect(newRatio).toBeGreaterThanOrEqual(0.6);
    expect(newRatio).toBeLessThanOrEqual(0.8);
    expect(usefulRatio).toBeGreaterThanOrEqual(0.1);
    expect(usefulRatio).toBeLessThanOrEqual(0.3);
    expect(skipRatio).toBeGreaterThanOrEqual(0.0);
    expect(skipRatio).toBeLessThanOrEqual(0.2);
  });
});
