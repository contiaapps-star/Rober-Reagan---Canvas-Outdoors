// Hardcoded provider tarifas (USD). Spend is estimated per call to keep the
// budget guard (Phase 6) cheap; we never ask the upstream invoice in real time.

export type Provider =
  | 'apify'
  | 'zenrows'
  | 'serper'
  | 'dataforseo'
  | 'youtube'
  | 'openrouter';

// OpenRouter passes the upstream model price through. Numbers are USD per
// 1M tokens (input, output). Sources: OpenRouter pricing page snapshot.
export const OPENROUTER_MODEL_RATES: Record<
  string,
  { inputUsdPerMTok: number; outputUsdPerMTok: number }
> = {
  'anthropic/claude-sonnet-4-6': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
  'anthropic/claude-haiku-4-5': { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
};

// Per-call estimates for non-LLM providers (rough — used as Phase 6 input only).
// Values in USD.
export const PROVIDER_CALL_COSTS: Record<
  Exclude<Provider, 'openrouter'>,
  number
> = {
  apify: 0.05,
  zenrows: 0.002,
  serper: 0.001,
  dataforseo: 0.05,
  youtube: 0,
};

// Per-action overrides — surface used by BudgetGuard and the cost reporter so
// each provider can charge differently depending on what was called. Falls back
// to PROVIDER_CALL_COSTS[provider] when the action key is unknown.
export const PROVIDER_ACTION_COSTS: Record<string, number> = {
  // Apify actor flavours
  'apify:meta': 0.05,
  'apify:tiktok': 0.03,
  'apify:youtube': 0.03,
  'apify:google_ads': 0.05,
  // Zenrows scrape (per request)
  'zenrows:scrape': 0.001,
  // Serper SERP query
  'serper:search': 0.001,
  // DataForSEO backlink lookup per domain
  'dataforseo:backlinks': 0.04,
};

export function estimateProviderCallCost(
  provider: Exclude<Provider, 'openrouter'>,
  action?: string,
): number {
  if (action) {
    const key = `${provider}:${action}`;
    if (PROVIDER_ACTION_COSTS[key] !== undefined) {
      return PROVIDER_ACTION_COSTS[key]!;
    }
  }
  return PROVIDER_CALL_COSTS[provider] ?? 0;
}

export function estimateOpenrouterCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rate = OPENROUTER_MODEL_RATES[model];
  if (!rate) return 0;
  const input = (promptTokens / 1_000_000) * rate.inputUsdPerMTok;
  const output = (completionTokens / 1_000_000) * rate.outputUsdPerMTok;
  return input + output;
}

// Convert a USD float to integer cents — we store spend as cents in the DB to
// avoid floating-point drift.
export function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}
