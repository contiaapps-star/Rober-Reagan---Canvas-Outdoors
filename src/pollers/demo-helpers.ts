import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deterministicRng, todayIsoUtc, type PollerContext } from './base.js';

// Read the operation mode at call time (not at import time) so tests can
// flip it via process.env.OPERATION_MODE without having to re-import env.ts.
function operationMode(): 'demo' | 'live' {
  const raw = process.env.OPERATION_MODE;
  return raw === 'live' ? 'live' : 'demo';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

const fixtureCache = new Map<string, unknown[]>();

export function loadFixture<T>(channelFile: string): T[] {
  const cached = fixtureCache.get(channelFile);
  if (cached) return cached as T[];
  const fp = path.join(FIXTURES_DIR, `${channelFile}.json`);
  const raw = readFileSync(fp, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`fixture ${channelFile}.json must be a JSON array`);
  }
  fixtureCache.set(channelFile, parsed);
  return parsed as T[];
}

export type DemoSelection<T> = {
  templates: T[];
  indices: number[];
  rng: () => number;
};

export function selectDemoTemplates<T>(
  channel: string,
  ctx: PollerContext,
  fixture: T[],
  maxItems: number = 3,
): DemoSelection<T> {
  const date = ctx.dateIso ?? todayIsoUtc();
  const seedKey = [date, channel, ctx.competitorId ?? 'global'].join('|');
  const rng = deterministicRng(seedKey);
  const count = Math.floor(rng() * (maxItems + 1)); // 0..maxItems
  if (count === 0 || fixture.length === 0) {
    return { templates: [], indices: [], rng };
  }
  // Pick `count` distinct indices from the fixture.
  const pool = fixture.map((_t, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const taken = pool.slice(0, Math.min(count, pool.length));
  return {
    templates: taken.map((idx) => fixture[idx]!),
    indices: taken,
    rng,
  };
}

export function assertDemoMode(_channel: string): void {
  if (operationMode() === 'live') {
    throw new Error('Live mode pending in Fase 5');
  }
}

export function isDemo(): boolean {
  return operationMode() === 'demo';
}

export function dateToUnixUtc(dateIso: string): number {
  return Math.floor(new Date(`${dateIso}T06:00:00Z`).getTime() / 1000);
}
