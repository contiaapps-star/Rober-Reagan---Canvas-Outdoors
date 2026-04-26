import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { randomUUID } from 'node:crypto';

import { competitors, type Competitor } from '../../src/db/schema.js';
import type { PollerContext } from '../../src/pollers/base.js';
import { websitePoller } from '../../src/pollers/website.js';
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
    dateIso: '2026-04-25',
  };
}

const SITEMAP_OK = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://aquapointdrilling.example/blog/spring-promo</loc><lastmod>2026-04-22</lastmod></url>
  <url><loc>https://aquapointdrilling.example/services/well-drilling</loc><lastmod>2026-04-23</lastmod></url>
</urlset>`;

const RSS_OK = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>AquaPoint Blog</title>
  <item>
    <title>New deep-well rig in fleet</title>
    <link>https://aquapointdrilling.example/blog/new-deep-well-rig</link>
    <pubDate>Tue, 22 Apr 2026 12:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Spring service deals</title>
    <link>https://aquapointdrilling.example/blog/spring-service-deals</link>
    <pubDate>Wed, 23 Apr 2026 12:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ZENROWS_INDEX_HTML = `<html><body>
<a href="/blog/post-a">Post A</a>
<a href="/blog/post-b">Post B</a>
<a href="https://aquapointdrilling.example/news/water-quality-2026">News A</a>
</body></html>`;

const ZENROWS_PAGE_HTML = `<html>
<head><title>Spring Promo — AquaPoint</title></head>
<body><p>Limited-time spring discount on deep-well drilling. Schedule by April 30.</p></body>
</html>`;

function zenrowsHandler(body: string) {
  return http.get('https://api.zenrows.com/v1/', ({ request }) => {
    const u = new URL(request.url);
    const apikey = u.searchParams.get('apikey');
    const target = u.searchParams.get('url');
    const jsRender = u.searchParams.get('js_render');
    if (!apikey) return new HttpResponse('missing apikey', { status: 401 });
    if (!target) return new HttpResponse('missing url', { status: 400 });
    if (jsRender !== 'true') return new HttpResponse('js_render must be true', { status: 400 });
    return new HttpResponse(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  });
}

describe('website live poller (tier 1: sitemap.xml)', () => {
  it('parses sitemap.xml and returns URLs as new poll items', async () => {
    server.use(
      http.get('https://aquapointdrilling.example/sitemap.xml', () =>
        new HttpResponse(SITEMAP_OK, {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }),
      ),
      // Page scrapes go through ZenRows.
      zenrowsHandler(ZENROWS_PAGE_HTML),
    );

    const result = await websitePoller.poll(makeCtx());
    expect(result.items.length).toBe(2);
    const urls = result.items.map((i) => i.sourceUrl).sort();
    expect(urls).toEqual([
      'https://aquapointdrilling.example/blog/spring-promo',
      'https://aquapointdrilling.example/services/well-drilling',
    ]);
    // URL classifier: /blog/ → new_blog_post; /services/ → new_landing_page
    const blog = result.items.find((i) => i.sourceUrl.includes('/blog/'));
    const lp = result.items.find((i) => i.sourceUrl.includes('/services/'));
    expect(blog?.activityType).toBe('new_blog_post');
    expect(lp?.activityType).toBe('new_landing_page');
  });
});

describe('website live poller (tier 2: RSS fallback)', () => {
  it('falls back to /feed when sitemap.xml returns 404', async () => {
    server.use(
      http.get('https://aquapointdrilling.example/sitemap.xml', () =>
        new HttpResponse('not found', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/feed', () =>
        new HttpResponse(RSS_OK, {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }),
      ),
      zenrowsHandler(ZENROWS_PAGE_HTML),
    );

    const result = await websitePoller.poll(makeCtx());
    expect(result.items.length).toBe(2);
    const urls = result.items.map((i) => i.sourceUrl).sort();
    expect(urls).toEqual([
      'https://aquapointdrilling.example/blog/new-deep-well-rig',
      'https://aquapointdrilling.example/blog/spring-service-deals',
    ]);
  });
});

describe('website live poller (tier 3: ZenRows hash diff)', () => {
  it('falls back to ZenRows hash diff when sitemap+RSS both fail', async () => {
    let zenrowsCalls: Array<{ url: string; jsRender: string | null }> = [];
    server.use(
      http.get('https://aquapointdrilling.example/sitemap.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/feed', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/rss', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/atom.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/feed.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/rss.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://api.zenrows.com/v1/', ({ request }) => {
        const u = new URL(request.url);
        zenrowsCalls.push({
          url: u.searchParams.get('url') ?? '',
          jsRender: u.searchParams.get('js_render'),
        });
        const target = u.searchParams.get('url') ?? '';
        if (target.endsWith('/blog') || target.endsWith('/news')) {
          return new HttpResponse(ZENROWS_INDEX_HTML, { status: 200 });
        }
        return new HttpResponse(ZENROWS_PAGE_HTML, { status: 200 });
      }),
    );

    const result = await websitePoller.poll(makeCtx());
    // At least one URL must be found (we link to /blog/post-a and /news/...).
    expect(result.items.length).toBeGreaterThan(0);
    // All ZenRows calls must request js_render=true.
    expect(zenrowsCalls.every((c) => c.jsRender === 'true')).toBe(true);
    // ZenRows must have been called at least once for /blog index.
    expect(zenrowsCalls.some((c) => c.url.endsWith('/blog'))).toBe(true);
  });

  it('ZenRows requests carry apikey query param and js_render=true', async () => {
    const seen: string[] = [];
    server.use(
      http.get('https://aquapointdrilling.example/sitemap.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/feed', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/rss', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/atom.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/feed.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://aquapointdrilling.example/rss.xml', () =>
        new HttpResponse('gone', { status: 404 }),
      ),
      http.get('https://api.zenrows.com/v1/', ({ request }) => {
        seen.push(request.url);
        return new HttpResponse(ZENROWS_INDEX_HTML, { status: 200 });
      }),
    );

    await websitePoller.poll(makeCtx());
    expect(seen.length).toBeGreaterThan(0);
    for (const url of seen) {
      const u = new URL(url);
      expect(u.searchParams.get('apikey')).toBe('test-zenrows-key');
      expect(u.searchParams.get('js_render')).toBe('true');
      expect(u.searchParams.get('premium_proxy')).toBe('true');
    }
  });
});
