import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { competitors, pollRuns } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export const DEGRADED_THRESHOLD = 3;
export const BROKEN_THRESHOLD = 7;

export type DegradationOutcome = 'degraded' | 'broken' | 'ok';

// Counts how many of the most recent poll_runs for (channel, competitorId)
// have status='failed'. Stops counting at the first non-failed row. Used to
// decide whether to flip a channel into degraded/broken.
export function countConsecutiveFailures(
  db: Db,
  channel: string,
  competitorId: string | null,
  // Cap how many rows we inspect. We never need more than BROKEN_THRESHOLD.
  cap: number = BROKEN_THRESHOLD,
): number {
  const where =
    competitorId === null
      ? and(eq(pollRuns.channel, channel), isNull(pollRuns.competitorId))
      : and(
          eq(pollRuns.channel, channel),
          eq(pollRuns.competitorId, competitorId),
        );

  const rows = db
    .select({ status: pollRuns.status })
    .from(pollRuns)
    .where(where)
    .orderBy(desc(pollRuns.startedAt))
    .limit(cap)
    .all();

  let count = 0;
  for (const r of rows) {
    if (r.status === 'failed') count += 1;
    else break;
  }
  return count;
}

function readDegradedChannels(db: Db, competitorId: string): string[] {
  const row = db
    .select({ d: competitors.degradedChannels })
    .from(competitors)
    .where(eq(competitors.id, competitorId))
    .get();
  return Array.isArray(row?.d) ? (row!.d as string[]) : [];
}

function writeDegradedChannels(
  db: Db,
  competitorId: string,
  channels: string[],
): void {
  // Deduplicate while preserving insertion order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of channels) {
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }
  db.update(competitors)
    .set({ degradedChannels: unique })
    .where(eq(competitors.id, competitorId))
    .run();
}

// Update competitors.degraded_channels for the given (channel × competitor)
// based on the most recent run status + history. Returns the resulting label.
export function applyDegradationFor(
  db: Db,
  channel: string,
  competitorId: string | null,
  lastRunStatus: 'ok' | 'failed' | 'partial',
): DegradationOutcome {
  if (!competitorId) return 'ok';

  if (lastRunStatus === 'ok' || lastRunStatus === 'partial') {
    // Reset: drop both `<channel>` and `<channel>:broken` markers.
    const existing = readDegradedChannels(db, competitorId);
    const filtered = existing.filter(
      (c) => c !== channel && c !== `${channel}:broken`,
    );
    if (filtered.length !== existing.length) {
      writeDegradedChannels(db, competitorId, filtered);
    }
    return 'ok';
  }

  const consecutive = countConsecutiveFailures(db, channel, competitorId);
  if (consecutive < DEGRADED_THRESHOLD) return 'ok';

  const existing = readDegradedChannels(db, competitorId);
  const without = existing.filter(
    (c) => c !== channel && c !== `${channel}:broken`,
  );

  if (consecutive >= BROKEN_THRESHOLD) {
    logger.error(
      { channel, competitorId, consecutive_failures: consecutive },
      'channel marked as BROKEN — requires dev attention',
    );
    writeDegradedChannels(db, competitorId, [...without, `${channel}:broken`]);
    return 'broken';
  }

  logger.warn(
    { channel, competitorId, consecutive_failures: consecutive },
    'channel marked as DEGRADED',
  );
  writeDegradedChannels(db, competitorId, [...without, channel]);
  return 'degraded';
}
