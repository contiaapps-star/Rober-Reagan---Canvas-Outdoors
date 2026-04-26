import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FALLBACK_SUMMARY,
  LIGHTWEIGHT_MODEL,
  MAX_RAW_FALLBACK_LEN,
  OPENROUTER_URL,
  SOTA_MODEL,
  summarizeActivity,
  type SummarizableActivity,
  type SummarizableCompetitor,
} from '../../src/services/llm-summarizer.js';
import { getSpendCents } from '../../src/services/api-spend.js';
import { createTestDb } from '../helpers/db.js';

const ACTIVITY: SummarizableActivity = {
  channel: 'website',
  activityType: 'new_landing_page',
  sourceUrl: 'https://reliantplumbingdfw.example/promo/water-softener',
  rawPayload: {
    headline: 'Water Softeners — Zero Down Financing',
    cta: 'Apply Now',
    promo: 'Zero down, 0% APR for 12 months',
  },
};

const COMPETITOR: SummarizableCompetitor = {
  name: 'Reliant Plumbing DFW',
  domain: 'reliantplumbingdfw.example',
  category: 'plumbing',
  tier: 'mondo_100m',
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function buildOpenrouterReply(
  model: string,
  content: string,
  promptTokens = 410,
  completionTokens = 60,
): unknown {
  return {
    id: `gen-${Math.random().toString(36).slice(2)}`,
    model,
    choices: [{ message: { role: 'assistant', content } }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

let ctx: ReturnType<typeof createTestDb>;

beforeEach(() => {
  ctx = createTestDb();
});

afterEach(() => {
  ctx.sqlite.close();
  vi.restoreAllMocks();
});

describe('llm-summarizer', () => {
  it('happy path: returns summary + themes and persists openrouter spend', async () => {
    // Use large token counts so the rounded-cent spend is unambiguously > 0.
    // 50k input × $3/M + 5k output × $15/M = $0.15 + $0.075 = $0.225 → 23 cents.
    const fetchSpy = vi.fn().mockResolvedValue(
      jsonResponse(
        buildOpenrouterReply(
          SOTA_MODEL,
          JSON.stringify({
            summary:
              'Reliant is pushing zero-down water softener promos — copy the financing pitch in our DFW landing page.',
            themes: ['promo', 'pricing', 'financing'],
          }),
          50_000,
          5_000,
        ),
      ),
    );

    const result = await summarizeActivity(ACTIVITY, COMPETITOR, {
      apiKey: 'test-key',
      fetchImpl: fetchSpy as unknown as typeof fetch,
      db: ctx.db,
      sleep: async () => undefined,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0]!;
    expect(calledUrl).toBe(OPENROUTER_URL);
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');

    expect(result.summary).toMatch(/Reliant/i);
    expect(result.themes).toEqual(['promo', 'pricing', 'financing']);

    const cents = getSpendCents(ctx.db, 'openrouter');
    expect(cents).toBeGreaterThan(0);
  });

  it('timeout retry: first call aborts, second OK on same model', async () => {
    let callIdx = 0;
    const fetchSpy = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      callIdx++;
      if (callIdx === 1) {
        // Simulate the AbortController firing.
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      return jsonResponse(
        buildOpenrouterReply(
          SOTA_MODEL,
          JSON.stringify({
            summary: 'Recovered after retry — we should test our own retry path.',
            themes: ['retry'],
          }),
        ),
      );
    });

    const sleepCalls: number[] = [];
    const result = await summarizeActivity(ACTIVITY, COMPETITOR, {
      apiKey: 'test-key',
      fetchImpl: fetchSpy as unknown as typeof fetch,
      db: ctx.db,
      sleep: async (ms: number) => {
        sleepCalls.push(ms);
      },
    });

    expect(callIdx).toBe(2);
    expect(sleepCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.summary).toMatch(/Recovered/);
    expect(result.themes).toEqual(['retry']);
  });

  it('both tiers fail: returns fallback summary without throwing', async () => {
    const fetchSpy = vi.fn().mockImplementation(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });

    const result = await summarizeActivity(ACTIVITY, COMPETITOR, {
      apiKey: 'test-key',
      fetchImpl: fetchSpy as unknown as typeof fetch,
      db: ctx.db,
      sleep: async () => undefined,
    });

    // 2 retries for SoTA + 2 retries for Lightweight = 4 calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(result.summary).toBe(FALLBACK_SUMMARY);
    expect(result.themes).toEqual([]);
  });

  it('malformed JSON: SoTA returns non-JSON, Lightweight also; final summary truncates raw content', async () => {
    const sotaJunk = 'plain text from the model with no braces at all and quite long '.repeat(8);
    const liteJunk = 'still no JSON in this payload either, trust me';
    let call = 0;
    const fetchSpy = vi.fn().mockImplementation(async () => {
      call++;
      const model = call === 1 ? SOTA_MODEL : LIGHTWEIGHT_MODEL;
      const content = call === 1 ? sotaJunk : liteJunk;
      return jsonResponse(buildOpenrouterReply(model, content));
    });

    const result = await summarizeActivity(ACTIVITY, COMPETITOR, {
      apiKey: 'test-key',
      fetchImpl: fetchSpy as unknown as typeof fetch,
      db: ctx.db,
      sleep: async () => undefined,
    });

    expect(call).toBe(2);
    expect(result.themes).toEqual([]);
    expect(result.summary.length).toBeLessThanOrEqual(MAX_RAW_FALLBACK_LEN);
    expect(result.summary).toBe(liteJunk.slice(0, MAX_RAW_FALLBACK_LEN));
  });
});
