import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import { competitors, type Competitor } from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { seoBacklinksPoller } from '../../src/pollers/seo-backlinks.js';
import { startMswServer, withLiveMode } from '../helpers/msw.js';
import { createTestDb } from '../helpers/db.js';

const server = startMswServer();
withLiveMode();

let ctx: ReturnType<typeof createTestDb>;
let competitor: Competitor;

beforeEach(() => {
  ctx = createTestDb();
  const id = randomUUID();
  ctx.db
    .insert(competitors)
    .values({
      id,
      name: 'AquaPoint Drilling Co.',
      domain: 'aquapointdrilling.example',
      category: 'both',
      tier: 'mondo_100m',
    })
    .run();
  competitor = ctx.db.select().from(competitors).all()[0]!;
});

afterEach(() => {
  ctx.sqlite.close();
});

function makeCtx(): PollerContext {
  return {
    competitorId: competitor.id,
    competitor: { ...competitor, id: competitor.id },
    db: ctx.db,
  };
}

function dataForSeoResponse(items: Array<{
  domain_from: string;
  domain_from_rank: number;
  url_from: string;
  anchor: string;
  first_seen: string;
}>) {
  return {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            total_count: items.length,
            items,
          },
        ],
      },
    ],
  };
}

describe('seo_backlink live poller — DR threshold', () => {
  it('drops backlinks with DR below the configured threshold (30)', async () => {
    server.use(
      http.post(
        'https://api.dataforseo.com/v3/backlinks/backlinks/live',
        () =>
          HttpResponse.json(
            dataForSeoResponse([
              {
                domain_from: 'low-authority.example',
                domain_from_rank: 20,
                url_from: 'https://low-authority.example/post',
                anchor: 'water well',
                first_seen: '2026-04-22',
              },
              {
                domain_from: 'high-authority.example',
                domain_from_rank: 75,
                url_from: 'https://high-authority.example/feature',
                anchor: 'best drilling',
                first_seen: '2026-04-22',
              },
            ]),
          ),
      ),
    );

    const result = await seoBacklinksPoller.poll(makeCtx());
    expect(result.items.length).toBe(1);
    const it = result.items[0]!;
    const payload = it.payload as Record<string, unknown>;
    expect(payload.referring_domain).toBe('high-authority.example');
    expect(payload.domain_rating).toBe(75);
  });

  it('uses HTTP Basic auth with login/password', async () => {
    let authHeader: string | null = null;
    server.use(
      http.post(
        'https://api.dataforseo.com/v3/backlinks/backlinks/live',
        ({ request }) => {
          authHeader = request.headers.get('authorization');
          return HttpResponse.json(dataForSeoResponse([]));
        },
      ),
    );

    await seoBacklinksPoller.poll(makeCtx());
    expect(authHeader).not.toBeNull();
    expect(authHeader!.startsWith('Basic ')).toBe(true);
    const decoded = Buffer.from(authHeader!.slice(6), 'base64').toString('utf8');
    expect(decoded).toBe('test-dfs-login:test-dfs-password');
  });
});
