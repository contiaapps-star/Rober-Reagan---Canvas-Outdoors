import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runSeed } from '../../scripts/seed.js';
import {
  countActivitiesByStatus,
  getRecentActivities,
} from '../../src/db/queries.js';
import { createTestDb } from '../helpers/db.js';

describe('queries', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    ctx = createTestDb();
    await runSeed(ctx.db);
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  it('getRecentActivities filters by channel and orders by detected_at DESC', () => {
    const { db } = ctx;
    const rows = getRecentActivities(db, 100, { channel: 'tiktok' });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.channel).toBe('tiktok');
    }
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.detectedAt).toBeGreaterThanOrEqual(rows[i]!.detectedAt);
    }

    const all = getRecentActivities(db, 200);
    expect(all.length).toBeGreaterThan(rows.length);
  });

  it('countActivitiesByStatus returns positive counts for new/useful/skip', () => {
    const { db } = ctx;
    const counts = countActivitiesByStatus(db);
    expect(counts.new).toBeGreaterThan(0);
    expect(counts.useful).toBeGreaterThan(0);
    expect(counts.skip).toBeGreaterThan(0);
    const total = counts.new + counts.useful + counts.skip;
    expect(total).toBeGreaterThanOrEqual(80);
    expect(total).toBeLessThanOrEqual(120);
  });
});
