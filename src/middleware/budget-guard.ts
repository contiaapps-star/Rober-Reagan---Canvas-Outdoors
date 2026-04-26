import { sql } from 'drizzle-orm';

import { type Provider, estimateOpenrouterCostUsd, estimateProviderCallCost } from '../config/api-costs.js';
import type { Db } from '../db/client.js';
import { apiSpendLog } from '../db/schema.js';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { currentMonthIso } from '../services/api-spend.js';

export const WARN_THRESHOLD_RATIO = 0.8;

export class BudgetExceededError extends Error {
  readonly provider: Provider;
  readonly monthlyBudgetUsd: number;
  readonly currentSpendUsd: number;
  readonly attemptedCostUsd: number;
  constructor(opts: {
    provider: Provider;
    monthlyBudgetUsd: number;
    currentSpendUsd: number;
    attemptedCostUsd: number;
  }) {
    super(
      `BudgetExceededError: ${opts.provider} would push spend to ` +
        `$${(opts.currentSpendUsd + opts.attemptedCostUsd).toFixed(2)} ` +
        `over cap $${opts.monthlyBudgetUsd.toFixed(2)}`,
    );
    this.name = 'BudgetExceededError';
    this.provider = opts.provider;
    this.monthlyBudgetUsd = opts.monthlyBudgetUsd;
    this.currentSpendUsd = opts.currentSpendUsd;
    this.attemptedCostUsd = opts.attemptedCostUsd;
  }
}

export type GuardOptions = {
  db: Db;
  provider: Provider;
  // estimated USD that this call is about to spend
  estimatedCostUsd: number;
  // override env.MONTHLY_BUDGET_USD (used by tests)
  monthlyBudgetUsd?: number;
  now?: Date;
};

function totalSpendCentsThisMonth(db: Db, now: Date): number {
  const month = currentMonthIso(now);
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${apiSpendLog.spendUsd}), 0)`,
    })
    .from(apiSpendLog)
    .where(sql`${apiSpendLog.month} = ${month}`)
    .get();
  return Number(row?.total ?? 0);
}

export function getMonthSpendUsd(db: Db, now: Date = new Date()): number {
  return totalSpendCentsThisMonth(db, now) / 100;
}

// Throws BudgetExceededError when a call would put us over the cap. Logs WARN
// at 80% utilization. Returns silently when within budget.
export function assertBudget(opts: GuardOptions): void {
  const cap = opts.monthlyBudgetUsd ?? env.MONTHLY_BUDGET_USD;
  const now = opts.now ?? new Date();
  const currentUsd = getMonthSpendUsd(opts.db, now);
  const projected = currentUsd + Math.max(0, opts.estimatedCostUsd);

  if (projected >= cap) {
    logger.error(
      {
        provider: opts.provider,
        cap_usd: cap,
        current_usd: currentUsd,
        attempted_usd: opts.estimatedCostUsd,
      },
      'budget guard: monthly cap exceeded — aborting call',
    );
    throw new BudgetExceededError({
      provider: opts.provider,
      monthlyBudgetUsd: cap,
      currentSpendUsd: currentUsd,
      attemptedCostUsd: opts.estimatedCostUsd,
    });
  }

  if (projected >= WARN_THRESHOLD_RATIO * cap) {
    logger.warn(
      {
        provider: opts.provider,
        cap_usd: cap,
        current_usd: currentUsd,
        projected_usd: projected,
        ratio: projected / cap,
      },
      'budget guard: spend approaching cap',
    );
  }
}

// Helper used by callers that haven't already estimated their own cost — they
// can ask for the per-call default.
export function estimateProviderCost(
  provider: Provider,
  action?: string,
  // For openrouter we need (model, promptTokens, completionTokens). action is
  // used only by non-llm providers.
  llm?: { model: string; promptTokens: number; completionTokens: number },
): number {
  if (provider === 'openrouter') {
    if (!llm) return 0;
    return estimateOpenrouterCostUsd(
      llm.model,
      llm.promptTokens,
      llm.completionTokens,
    );
  }
  return estimateProviderCallCost(provider, action);
}
