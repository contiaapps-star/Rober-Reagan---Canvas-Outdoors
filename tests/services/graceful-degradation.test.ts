import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { runSeed } from '../../scripts/seed.js';
import { competitors, pollRuns } from '../../src/db/schema.js';
import {
  applyDegradationFor,
  countConsecutiveFailures,
  BROKEN_THRESHOLD,
  DEGRADED_THRESHOLD,
} from '../../src/services/graceful-degradation.js';
import { createTestDb, type TestDb } from '../helpers/db.js';

let ctx: ReturnType<typeof createTestDb>;

function firstCompetitorId(db: TestDb): string {
  const row = db.select({ id: competitors.id }).from(competitors).get();
  if (!row) throw new Error('no competitor seeded');
  return row.id;
}

function readDegraded(db: TestDb, id: string): string[] {
  const row = db
    .select({ d: competitors.degradedChannels })
    .from(competitors)
    .where(eq(competitors.id, id))
    .get();
  return Array.isArray(row?.d) ? (row!.d as string[]) : [];
}

function insertRun(
  db: TestDb,
  channel: string,
  competitorId: string,
  status: 'ok' | 'failed' | 'partial',
  startedAt: number,
) {
  db.insert(pollRuns)
    .values({
      id: randomUUID(),
      channel,
      competitorId,
      startedAt,
      finishedAt: startedAt + 1,
      status,
      errorMessage: status === 'failed' ? 'simulated' : null,
      itemsFetched: status === 'ok' ? 5 : 0,
      costUsdEstimated: 0,
    })
    .run();
}

beforeEach(async () => {
  ctx = createTestDb();
  await runSeed(ctx.db);
  ctx.db.delete(pollRuns).run();
});

afterEach(() => {
  ctx.sqlite.close();
});

describe('graceful degradation', () => {
  it('marks a channel as DEGRADED after 3 consecutive failed polls', async () => {
    const cId = firstCompetitorId(ctx.db);
    const t0 = Math.floor(Date.now() / 1000) - 1000;
    insertRun(ctx.db, 'website', cId, 'failed', t0);
    insertRun(ctx.db, 'website', cId, 'failed', t0 + 100);
    insertRun(ctx.db, 'website', cId, 'failed', t0 + 200);

    expect(countConsecutiveFailures(ctx.db, 'website', cId)).toBe(DEGRADED_THRESHOLD);

    const outcome = applyDegradationFor(ctx.db, 'website', cId, 'failed');
    expect(outcome).toBe('degraded');
    expect(readDegraded(ctx.db, cId)).toContain('website');
    expect(readDegraded(ctx.db, cId)).not.toContain('website:broken');
  });

  it('marks a channel as BROKEN after 7 consecutive failed polls', async () => {
    const cId = firstCompetitorId(ctx.db);
    const t0 = Math.floor(Date.now() / 1000) - 10_000;
    for (let i = 0; i < BROKEN_THRESHOLD; i++) {
      insertRun(ctx.db, 'meta_facebook', cId, 'failed', t0 + i * 100);
    }
    expect(countConsecutiveFailures(ctx.db, 'meta_facebook', cId)).toBeGreaterThanOrEqual(
      BROKEN_THRESHOLD,
    );
    const outcome = applyDegradationFor(ctx.db, 'meta_facebook', cId, 'failed');
    expect(outcome).toBe('broken');
    const degraded = readDegraded(ctx.db, cId);
    expect(degraded).toContain('meta_facebook:broken');
    expect(degraded).not.toContain('meta_facebook');
  });

  it('1 OK poll after 3 failures resets the channel out of degraded_channels', async () => {
    const cId = firstCompetitorId(ctx.db);
    const t0 = Math.floor(Date.now() / 1000) - 10_000;
    insertRun(ctx.db, 'tiktok', cId, 'failed', t0);
    insertRun(ctx.db, 'tiktok', cId, 'failed', t0 + 100);
    insertRun(ctx.db, 'tiktok', cId, 'failed', t0 + 200);

    expect(applyDegradationFor(ctx.db, 'tiktok', cId, 'failed')).toBe('degraded');
    expect(readDegraded(ctx.db, cId)).toContain('tiktok');

    // A successful run arrives next
    insertRun(ctx.db, 'tiktok', cId, 'ok', t0 + 300);
    const outcome = applyDegradationFor(ctx.db, 'tiktok', cId, 'ok');
    expect(outcome).toBe('ok');
    expect(readDegraded(ctx.db, cId)).not.toContain('tiktok');
    expect(readDegraded(ctx.db, cId)).not.toContain('tiktok:broken');
  });
});
