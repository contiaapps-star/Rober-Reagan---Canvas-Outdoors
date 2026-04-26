import type { Db } from '../db/client.js';
import {
  estimateOpenrouterCostUsd,
  OPENROUTER_MODEL_RATES,
} from '../config/api-costs.js';
import { logger } from '../lib/logger.js';
import { recordSpend } from './api-spend.js';

export const SOTA_MODEL = 'anthropic/claude-sonnet-4-6';
export const LIGHTWEIGHT_MODEL = 'anthropic/claude-haiku-4-5';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const FALLBACK_SUMMARY = '[Summary unavailable — retry on next poll]';
export const DEFAULT_TIMEOUT_MS = 15_000;
export const RETRY_BACKOFF_MS = 2_000;
export const MAX_RAW_FALLBACK_LEN = 200;

export type LlmFetch = typeof fetch;

export type SummarizableActivity = {
  channel: string;
  activityType: string;
  sourceUrl: string;
  rawPayload: unknown;
};

export type SummarizableCompetitor = {
  name: string;
  domain: string;
  category: 'well' | 'plumbing' | 'both' | string;
  tier: string;
};

export type SummarizeResult = {
  summary: string;
  themes: string[];
};

export type SummarizeOptions = {
  apiKey?: string;
  fetchImpl?: LlmFetch;
  db?: Db;
  timeoutMs?: number;
  // Dependency-injectable sleep for tests; defaults to setTimeout-based sleep.
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

const SYSTEM_PROMPT = `You are a marketing intelligence analyst. Given a competitor activity in the home services trade (water wells / plumbing), produce:
1. A 1-sentence "Why this matters to FlowCore" summary (<25 words, plain English, action-oriented).
2. 2–4 themes as comma-separated tags (e.g., "pricing", "local-seo", "viral", "promo", "service-area-expansion").
Reply as compact JSON: {"summary":"...","themes":["..."]}`;

function buildUserPrompt(
  activity: SummarizableActivity,
  competitor: SummarizableCompetitor,
): string {
  const payloadStr = safeStringify(activity.rawPayload);
  return [
    `Competitor: ${competitor.name} (${competitor.domain}) — ${competitor.category}, tier=${competitor.tier}`,
    `Channel: ${activity.channel}`,
    `Activity type: ${activity.activityType}`,
    `Source URL: ${activity.sourceUrl}`,
    `Raw payload: ${payloadStr}`,
  ].join('\n');
}

function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s.length > 1500 ? `${s.slice(0, 1500)}…` : s;
  } catch {
    return String(value);
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

class LlmTimeoutError extends Error {
  constructor() {
    super('LLM request timed out');
    this.name = 'LlmTimeoutError';
  }
}

type RawCallResult = {
  rawContent: string;
  promptTokens: number;
  completionTokens: number;
};

async function callOpenrouter(
  model: string,
  apiKey: string,
  fetchImpl: LlmFetch,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
): Promise<RawCallResult> {
  const controller = new AbortController();
  const timeoutId: NodeJS.Timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetchImpl(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://flowcore.local',
        'X-Title': 'FlowCore Marketing Sensor',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 256,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${model} HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content ?? '';
    const usage = json.usage ?? {};
    return {
      rawContent: typeof content === 'string' ? content : String(content),
      promptTokens: Number(usage.prompt_tokens ?? 0),
      completionTokens: Number(usage.completion_tokens ?? 0),
    };
  } catch (err) {
    if (
      err instanceof DOMException && err.name === 'AbortError'
    ) {
      throw new LlmTimeoutError();
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export type ParsedLlmJson = {
  summary?: string;
  themes?: string[];
};

export function parseLlmJson(raw: string): ParsedLlmJson | null {
  if (!raw) return null;
  // Some models wrap JSON in code fences; strip them defensively.
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  // Locate the first {...} block.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as ParsedLlmJson;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeThemes(themes: unknown): string[] {
  if (!Array.isArray(themes)) return [];
  return themes
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

function recordCallSpend(
  db: Db | undefined,
  model: string,
  promptTokens: number,
  completionTokens: number,
  now: Date,
): number {
  const cost = estimateOpenrouterCostUsd(model, promptTokens, completionTokens);
  if (db && cost > 0) recordSpend(db, 'openrouter', cost, now);
  return cost;
}

async function tryModel(
  model: string,
  apiKey: string,
  fetchImpl: LlmFetch,
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
  db: Db | undefined,
  now: Date,
): Promise<{ result: RawCallResult; cost: number; durationMs: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const t0 = Date.now();
    try {
      const result = await callOpenrouter(
        model,
        apiKey,
        fetchImpl,
        systemPrompt,
        userPrompt,
        timeoutMs,
      );
      const durationMs = Date.now() - t0;
      const cost = recordCallSpend(
        db,
        model,
        result.promptTokens,
        result.completionTokens,
        now,
      );
      logger.info(
        {
          model,
          attempt,
          duration_ms: durationMs,
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          cost_usd: Number(cost.toFixed(6)),
        },
        'llm summarizer call ok',
      );
      return { result, cost, durationMs };
    } catch (err) {
      lastErr = err;
      logger.warn(
        {
          model,
          attempt,
          duration_ms: Date.now() - t0,
          err: err instanceof Error ? err.message : String(err),
        },
        'llm summarizer call failed',
      );
      if (attempt === 1) await sleep(RETRY_BACKOFF_MS);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function summarizeActivity(
  activity: SummarizableActivity,
  competitor: SummarizableCompetitor,
  opts: SummarizeOptions = {},
): Promise<SummarizeResult> {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const now = (opts.now ?? (() => new Date()))();

  if (!apiKey) {
    logger.warn(
      { channel: activity.channel, source_url: activity.sourceUrl },
      'OPENROUTER_API_KEY missing — returning fallback summary',
    );
    return { summary: FALLBACK_SUMMARY, themes: [] };
  }

  if (typeof fetchImpl !== 'function') {
    logger.error('global fetch is not available — returning fallback summary');
    return { summary: FALLBACK_SUMMARY, themes: [] };
  }

  const systemPrompt = SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(activity, competitor);

  // Tier 1: SoTA. Tier 2 fallback: Lightweight.
  const models = [SOTA_MODEL, LIGHTWEIGHT_MODEL];
  let lastRaw: string | null = null;
  for (const model of models) {
    try {
      const { result } = await tryModel(
        model,
        apiKey,
        fetchImpl,
        systemPrompt,
        userPrompt,
        timeoutMs,
        sleep,
        opts.db,
        now,
      );
      lastRaw = result.rawContent;
      const parsed = parseLlmJson(result.rawContent);
      if (parsed?.summary && typeof parsed.summary === 'string') {
        return {
          summary: parsed.summary.trim(),
          themes: normalizeThemes(parsed.themes),
        };
      }
      // Parse failure on this tier — try the next model. Loop continues.
    } catch (err) {
      logger.warn(
        {
          model,
          err: err instanceof Error ? err.message : String(err),
        },
        'llm summarizer model tier failed — falling through',
      );
    }
  }

  // Both models exhausted. If we have any raw content, surface a truncated
  // version of it; otherwise full fallback.
  if (lastRaw && lastRaw.trim().length > 0) {
    const truncated = lastRaw.trim().slice(0, MAX_RAW_FALLBACK_LEN);
    return { summary: truncated, themes: [] };
  }
  return { summary: FALLBACK_SUMMARY, themes: [] };
}

// Re-exported for external code that needs to know which models we use.
export const KNOWN_MODELS = Object.keys(OPENROUTER_MODEL_RATES);
