import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { apiSpendLog } from '../db/schema.js';
import { type Provider, usdToCents } from '../config/api-costs.js';

export function currentMonthIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

// Atomically add `usd` to the running total for (provider, month). Stored as
// integer cents to avoid float drift.
export function recordSpend(
  db: Db,
  provider: Provider,
  usd: number,
  now: Date = new Date(),
): void {
  if (!Number.isFinite(usd) || usd <= 0) return;
  const month = currentMonthIso(now);
  const cents = usdToCents(usd);

  const existing = db
    .select({ id: apiSpendLog.id, spendUsd: apiSpendLog.spendUsd })
    .from(apiSpendLog)
    .where(and(eq(apiSpendLog.provider, provider), eq(apiSpendLog.month, month)))
    .get();

  const nowUnix = Math.floor(now.getTime() / 1000);

  if (existing) {
    db.update(apiSpendLog)
      .set({
        spendUsd: existing.spendUsd + cents,
        lastUpdated: nowUnix,
      })
      .where(eq(apiSpendLog.id, existing.id))
      .run();
    return;
  }

  db.insert(apiSpendLog)
    .values({
      id: randomUUID(),
      provider,
      month,
      spendUsd: cents,
      lastUpdated: nowUnix,
    })
    .run();
}

export function getSpendCents(
  db: Db,
  provider: Provider,
  now: Date = new Date(),
): number {
  const month = currentMonthIso(now);
  const row = db
    .select({ spendUsd: apiSpendLog.spendUsd })
    .from(apiSpendLog)
    .where(and(eq(apiSpendLog.provider, provider), eq(apiSpendLog.month, month)))
    .get();
  return row?.spendUsd ?? 0;
}
