import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  BudgetExceededError,
  WARN_THRESHOLD_RATIO,
  assertBudget,
  estimateProviderCost,
  getMonthSpendUsd,
} from '../../src/middleware/budget-guard.js';
import {
  estimateOpenrouterCostUsd,
  estimateProviderCallCost,
  PROVIDER_ACTION_COSTS,
} from '../../src/config/api-costs.js';
import { apiSpendLog } from '../../src/db/schema.js';
import { logger } from '../../src/lib/logger.js';
import { createTestDb } from '../helpers/db.js';
import { currentMonthIso } from '../../src/services/api-spend.js';

let ctx: ReturnType<typeof createTestDb>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function seedSpendCents(provider: string, cents: number, month?: string) {
  const m = month ?? currentMonthIso(new Date());
  ctx.db
    .insert(apiSpendLog)
    .values({
      id: randomUUID(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: provider as any,
      month: m,
      spendUsd: cents,
    })
    .run();
}

beforeEach(() => {
  ctx = createTestDb();
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  ctx.sqlite.close();
  vi.restoreAllMocks();
});

describe('BudgetGuard middleware', () => {
  it('does NOT block and does NOT warn when spend is below 80% of cap', () => {
    // cap=200, 50% spent ($100 = 10000 cents)
    seedSpendCents('apify', 10000);

    expect(getMonthSpendUsd(ctx.db)).toBeCloseTo(100, 5);

    expect(() =>
      assertBudget({
        db: ctx.db,
        provider: 'apify',
        estimatedCostUsd: 5,
        monthlyBudgetUsd: 200,
      }),
    ).not.toThrow();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs WARN but does NOT block when projected spend is between 80% and 100%', () => {
    // cap=200, 79% spent ($158 = 15800 cents) → +$5 → 81.5% projected
    seedSpendCents('apify', 15800);

    expect(() =>
      assertBudget({
        db: ctx.db,
        provider: 'apify',
        estimatedCostUsd: 5,
        monthlyBudgetUsd: 200,
      }),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('throws BudgetExceededError when projected spend reaches or exceeds the cap', () => {
    // cap=200, 99% spent ($198 = 19800 cents) → +$5 → exceeds cap
    seedSpendCents('apify', 19800);

    expect(() =>
      assertBudget({
        db: ctx.db,
        provider: 'apify',
        estimatedCostUsd: 5,
        monthlyBudgetUsd: 200,
      }),
    ).toThrow(BudgetExceededError);

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('uses env.MONTHLY_BUDGET_USD by default and aggregates across providers', () => {
    // env default in test is 200. Mix providers.
    seedSpendCents('apify', 10000); // $100
    seedSpendCents('openrouter', 9000); // $90

    // total=$190; +$15 → $205 > 200 → exceeds
    expect(() =>
      assertBudget({
        db: ctx.db,
        provider: 'serper',
        estimatedCostUsd: 15,
      }),
    ).toThrow(BudgetExceededError);
  });

  it('estimateProviderCost: per-provider tarifas match the hardcoded table', () => {
    // Apify: meta poll
    expect(estimateProviderCallCost('apify', 'meta')).toBeCloseTo(0.05, 6);
    // Apify: tiktok poll (per-handle override)
    expect(estimateProviderCallCost('apify', 'tiktok')).toBeCloseTo(0.03, 6);
    // Apify: youtube poll
    expect(estimateProviderCallCost('apify', 'youtube')).toBeCloseTo(0.03, 6);
    // Apify: google_ads
    expect(estimateProviderCallCost('apify', 'google_ads')).toBeCloseTo(0.05, 6);
    // Zenrows: scrape
    expect(estimateProviderCallCost('zenrows', 'scrape')).toBeCloseTo(0.001, 6);
    // Serper: search
    expect(estimateProviderCallCost('serper', 'search')).toBeCloseTo(0.001, 6);
    // DataForSEO: backlinks lookup
    expect(estimateProviderCallCost('dataforseo', 'backlinks')).toBeCloseTo(0.04, 6);
    // youtube data api → free quota (we model 0)
    expect(estimateProviderCallCost('youtube')).toBeCloseTo(0, 6);

    // Wrapper helper preserves results
    expect(
      estimateProviderCost('apify', 'meta'),
    ).toBe(PROVIDER_ACTION_COSTS['apify:meta']);

    // OpenRouter via wrapper computes correct cost
    const orCost = estimateProviderCost('openrouter', undefined, {
      model: 'anthropic/claude-sonnet-4-6',
      promptTokens: 1000,
      completionTokens: 500,
    });
    expect(orCost).toBeCloseTo(
      estimateOpenrouterCostUsd('anthropic/claude-sonnet-4-6', 1000, 500),
      6,
    );
    expect(orCost).toBeGreaterThan(0);
  });

  it('exposes WARN_THRESHOLD_RATIO at 0.8', () => {
    expect(WARN_THRESHOLD_RATIO).toBe(0.8);
  });
});
