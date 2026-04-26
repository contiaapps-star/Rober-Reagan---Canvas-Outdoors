import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

import { competitors } from '../db/schema.js';
import { env } from '../lib/env.js';
import { fetchText } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { PROVIDER_CALL_COSTS } from '../config/api-costs.js';
import { zenrowsScrape } from '../services/providers/zenrows.js';
import {
  type Poller,
  type PollItem,
  type PollResult,
  type PollerContext,
} from './base.js';
import {
  dateToUnixUtc,
  isDemo,
  loadFixture,
  selectDemoTemplates,
} from './demo-helpers.js';

type WebsiteFixture = {
  slug: string;
  title: string;
  activity_type: 'new_blog_post' | 'new_landing_page';
  word_count?: number;
  author?: string;
  cta?: string;
  promo?: string | null;
  kind: 'blog' | 'landing';
};

const CHANNEL = 'website';

async function pollDemo(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor) return { items: [], costUsdEst: 0 };
  const fixture = loadFixture<WebsiteFixture>('website');
  const { templates, indices } = selectDemoTemplates(CHANNEL, ctx, fixture);
  const detectedAt = dateToUnixUtc(
    ctx.dateIso ?? new Date().toISOString().slice(0, 10),
  );

  const items: PollItem[] = templates.map((t, i) => {
    const idx = indices[i] ?? i;
    const path = t.kind === 'blog' ? 'blog' : 'services';
    const url = `https://${ctx.competitor!.domain}/${path}/${t.slug}-${idx}`;
    return {
      channel: 'website',
      activityType: t.activity_type,
      sourceUrl: url,
      detectedAt,
      publishedAt: detectedAt - 3600,
      payload: {
        url,
        title: t.title,
        kind: t.kind,
        word_count: t.word_count ?? null,
        cta: t.cta ?? null,
        promo: t.promo ?? null,
        author: t.author ?? null,
      },
    };
  });

  return { items, costUsdEst: 0 };
}

// ─── Sitemap parsing ────────────────────────────────────────────────────────
// sitemap.xml may be a single urlset or a sitemapindex. We follow up to one
// level of sitemapindex and aggregate child URLs.

const SitemapEntrySchema = z.object({
  loc: z.string(),
  lastmod: z.string().optional(),
});
type SitemapEntry = z.infer<typeof SitemapEntrySchema>;

function parseSitemapXml(xml: string): {
  urls: SitemapEntry[];
  childIndexes: string[];
} {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const urlset = parsed.urlset as
    | { url?: unknown }
    | undefined;
  const sitemapindex = parsed.sitemapindex as
    | { sitemap?: unknown }
    | undefined;

  const urls: SitemapEntry[] = [];
  const childIndexes: string[] = [];

  if (urlset) {
    const raw = Array.isArray(urlset.url) ? urlset.url : urlset.url ? [urlset.url] : [];
    for (const u of raw) {
      const e = SitemapEntrySchema.safeParse(u);
      if (e.success) urls.push(e.data);
    }
  }
  if (sitemapindex) {
    const raw = Array.isArray(sitemapindex.sitemap)
      ? sitemapindex.sitemap
      : sitemapindex.sitemap
      ? [sitemapindex.sitemap]
      : [];
    for (const s of raw) {
      const e = SitemapEntrySchema.safeParse(s);
      if (e.success) childIndexes.push(e.data.loc);
    }
  }
  return { urls, childIndexes };
}

async function tryFetchSitemap(domain: string): Promise<SitemapEntry[] | null> {
  const url = `https://${domain}/sitemap.xml`;
  try {
    const { status, text } = await fetchText(url, { timeoutMs: 15_000 });
    if (status >= 400) return null;
    const { urls, childIndexes } = parseSitemapXml(text);
    if (urls.length > 0) return urls;
    // Follow up to 3 child index entries (defensive cap).
    const collected: SitemapEntry[] = [];
    for (const childUrl of childIndexes.slice(0, 3)) {
      try {
        const { status: cs, text: ctext } = await fetchText(childUrl, {
          timeoutMs: 15_000,
        });
        if (cs >= 400) continue;
        const inner = parseSitemapXml(ctext);
        collected.push(...inner.urls);
      } catch {
        // skip child index errors
      }
    }
    return collected.length > 0 ? collected : null;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), url },
      'sitemap fetch failed',
    );
    return null;
  }
}

// ─── RSS / Atom parsing ────────────────────────────────────────────────────
const RSS_PATHS = ['/feed', '/rss', '/atom.xml', '/feed.xml', '/rss.xml'];

type RssItem = { url: string; pubDate?: string; title?: string };

function parseRssOrAtom(xml: string): RssItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const items: RssItem[] = [];

  // RSS 2.0: rss > channel > item[]
  const rss = parsed.rss as { channel?: { item?: unknown } } | undefined;
  if (rss?.channel?.item) {
    const arr = Array.isArray(rss.channel.item)
      ? rss.channel.item
      : [rss.channel.item];
    for (const it of arr) {
      const obj = it as Record<string, unknown>;
      const link = typeof obj.link === 'string' ? obj.link : null;
      if (link) {
        items.push({
          url: link,
          pubDate: typeof obj.pubDate === 'string' ? obj.pubDate : undefined,
          title: typeof obj.title === 'string' ? obj.title : undefined,
        });
      }
    }
    return items;
  }

  // Atom: feed > entry[]
  const feed = parsed.feed as { entry?: unknown } | undefined;
  if (feed?.entry) {
    const arr = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
    for (const it of arr) {
      const obj = it as Record<string, unknown>;
      const link = obj.link as
        | { '@_href'?: string }
        | Array<{ '@_href'?: string }>
        | undefined;
      let href: string | null = null;
      if (Array.isArray(link)) {
        href = link[0]?.['@_href'] ?? null;
      } else if (link && typeof link === 'object') {
        href = link['@_href'] ?? null;
      }
      if (href) {
        items.push({
          url: href,
          pubDate:
            typeof obj.updated === 'string'
              ? obj.updated
              : typeof obj.published === 'string'
              ? obj.published
              : undefined,
          title: typeof obj.title === 'string' ? obj.title : undefined,
        });
      }
    }
    return items;
  }

  return items;
}

async function tryFetchRss(domain: string): Promise<RssItem[] | null> {
  for (const path of RSS_PATHS) {
    const url = `https://${domain}${path}`;
    try {
      const { status, text } = await fetchText(url, { timeoutMs: 15_000 });
      if (status >= 400) continue;
      const items = parseRssOrAtom(text);
      if (items.length > 0) return items;
    } catch {
      // try next path
    }
  }
  return null;
}

// ─── Hash diff via ZenRows ──────────────────────────────────────────────────
const HREF_RE = /<a[^>]+href=["']([^"']+)["']/gi;

function extractHrefs(html: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = HREF_RE.exec(html)) !== null) {
    const href = m[1]!.trim();
    if (href.startsWith('#') || href.startsWith('mailto:')) continue;
    out.add(href);
  }
  return [...out];
}

function absolutize(href: string, domain: string): string | null {
  try {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href;
    }
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `https://${domain}${href}`;
    return null;
  } catch {
    return null;
  }
}

function classifyActivityType(url: string): 'new_blog_post' | 'new_landing_page' {
  const u = url.toLowerCase();
  if (u.includes('/blog/') || u.includes('/news/')) return 'new_blog_post';
  return 'new_landing_page';
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function discoverNewUrls(
  domain: string,
  db: PollerContext['db'],
  competitorId: string,
  apiKey: string,
): Promise<{
  newUrls: string[];
  knownUrls: Set<string>;
  cost: number;
}> {
  let cost = 0;

  // Tier 1: sitemap.xml.
  const sitemap = await tryFetchSitemap(domain);
  if (sitemap && sitemap.length > 0) {
    return {
      newUrls: sitemap.map((s) => s.loc),
      knownUrls: new Set(),
      cost,
    };
  }

  // Tier 2: RSS / Atom.
  const rss = await tryFetchRss(domain);
  if (rss && rss.length > 0) {
    return {
      newUrls: rss.map((r) => r.url),
      knownUrls: new Set(),
      cost,
    };
  }

  // Tier 3: hash diff via ZenRows. Compare current hash against
  // competitors.last_index_hash; if changed, scrape /blog and /news and emit
  // unique hrefs.
  if (!apiKey) {
    throw new Error('website live: ZENROWS_API_KEY missing for tier-3 fallback');
  }

  const indexUrls = [`https://${domain}/blog`, `https://${domain}/news`];
  const htmls: string[] = [];
  for (const indexUrl of indexUrls) {
    const r = await zenrowsScrape({
      apiKey,
      url: indexUrl,
      jsRender: true,
      premiumProxy: true,
    });
    cost += PROVIDER_CALL_COSTS.zenrows;
    if (r.status < 400 && r.text) htmls.push(r.text);
  }
  const combined = htmls.join('\n');
  const currentHash = sha256Hex(combined);

  let prevHash: string | null = null;
  if (db) {
    const prev = db
      .select({ h: competitors.lastIndexHash })
      .from(competitors)
      .where(eq(competitors.id, competitorId))
      .get();
    prevHash = prev?.h ?? null;
  }

  if (prevHash === currentHash) {
    return { newUrls: [], knownUrls: new Set(), cost };
  }

  const all = htmls.flatMap(extractHrefs);
  const absolute: string[] = [];
  for (const href of all) {
    const abs = absolutize(href, domain);
    if (abs && abs.includes(domain)) absolute.push(abs);
  }
  const dedup = [...new Set(absolute)];

  if (db) {
    db.update(competitors)
      .set({
        lastIndexHash: currentHash,
        lastPolledAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(competitors.id, competitorId))
      .run();
  }

  return { newUrls: dedup, knownUrls: new Set(), cost };
}

// Scrape a single page via ZenRows and extract title + first paragraph.
async function scrapePage(
  url: string,
  apiKey: string,
): Promise<{ title: string | null; firstParagraph: string | null; cost: number }> {
  const r = await zenrowsScrape({
    apiKey,
    url,
    jsRender: true,
    premiumProxy: true,
  });
  const cost = PROVIDER_CALL_COSTS.zenrows;
  if (r.status >= 400 || !r.text) {
    return { title: null, firstParagraph: null, cost };
  }
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(r.text);
  const title = titleMatch ? titleMatch[1]!.trim() : null;
  const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(r.text);
  const firstParagraph = pMatch
    ? pMatch[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 280)
    : null;
  return { title, firstParagraph, cost };
}

async function pollLive(ctx: PollerContext): Promise<PollResult> {
  if (!ctx.competitor || !ctx.competitorId) return { items: [], costUsdEst: 0 };
  const domain = ctx.competitor.domain;
  const apiKey = env.ZENROWS_API_KEY ?? '';

  const { newUrls, cost: discoveryCost } = await discoverNewUrls(
    domain,
    ctx.db ?? null,
    ctx.competitorId,
    apiKey,
  );

  const detectedAt = Math.floor(Date.now() / 1000);
  const items: PollItem[] = [];
  let totalCost = discoveryCost;

  // Cap scrapes to 10 to keep cost predictable; rely on dedupe to skip URLs
  // we've seen before across runs.
  const toScrape = newUrls.slice(0, 10);
  for (const url of toScrape) {
    let title: string | null = null;
    let firstParagraph: string | null = null;
    if (apiKey) {
      try {
        const r = await scrapePage(url, apiKey);
        title = r.title;
        firstParagraph = r.firstParagraph;
        totalCost += r.cost;
      } catch (err) {
        logger.warn(
          { url, err: err instanceof Error ? err.message : String(err) },
          'website live scrapePage failed — using URL-only payload',
        );
      }
    }
    const activityType = classifyActivityType(url);
    items.push({
      channel: 'website',
      activityType,
      sourceUrl: url,
      detectedAt,
      publishedAt: null,
      payload: {
        url,
        title,
        first_paragraph: firstParagraph,
        kind: activityType === 'new_blog_post' ? 'blog' : 'landing',
      },
    });
  }

  return { items, costUsdEst: totalCost };
}

export const websitePoller: Poller = {
  channel: CHANNEL,
  async poll(ctx) {
    if (isDemo()) return pollDemo(ctx);
    return pollLive(ctx);
  },
};
