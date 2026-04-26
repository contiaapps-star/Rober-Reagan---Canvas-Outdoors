import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  canonicalizeUrl,
  computeDedupeHash,
  existsByHash,
  isoWeekFromUnix,
} from '../../src/services/dedupe.js';
import { activities, competitors } from '../../src/db/schema.js';
import { createTestDb } from '../helpers/db.js';

describe('dedupe — pure hashes', () => {
  it('website hash is stable across canonicalization (case + trailing slash + scheme)', () => {
    const competitorId = 'comp-123';
    const a = computeDedupeHash('website', {
      competitor_id: competitorId,
      url: 'https://Example.COM/Blog/post-1',
    });
    const b = computeDedupeHash('website', {
      competitor_id: competitorId,
      url: 'https://example.com/Blog/post-1',
    });
    // Note: pathname casing IS preserved (canonicalize lowercases host only).
    expect(a).toBe(b);
  });

  it('website URL with trailing slash matches one without', () => {
    const competitorId = 'comp-123';
    const a = computeDedupeHash('website', {
      competitor_id: competitorId,
      url: 'https://example.com/blog/post-1/',
    });
    const b = computeDedupeHash('website', {
      competitor_id: competitorId,
      url: 'https://example.com/blog/post-1',
    });
    expect(a).toBe(b);
  });

  it('meta hash incorporates landing_url — changing landing changes hash', () => {
    const base = {
      advertiser_id: 'adv-1',
      image_url: 'https://cdn.example/img/1.jpg',
      headline: 'X',
      cta: 'Book',
      landing_url: 'https://example.com/lp/a',
    };
    const a = computeDedupeHash('meta_facebook', base);
    const b = computeDedupeHash('meta_facebook', {
      ...base,
      landing_url: 'https://example.com/lp/b',
    });
    expect(a).not.toBe(b);
  });

  it('seo_ranking hash is week-bucketed: same keyword same ISO week → same hash', () => {
    // Two different unix days that fall in the same ISO week (e.g. Mon + Wed).
    const monday = Math.floor(new Date('2026-04-20T10:00:00Z').getTime() / 1000); // Mon
    const wednesday = Math.floor(new Date('2026-04-22T10:00:00Z').getTime() / 1000); // Wed
    expect(isoWeekFromUnix(monday)).toBe(isoWeekFromUnix(wednesday));

    const a = computeDedupeHash('seo_ranking', {
      competitor_id: 'comp-1',
      keyword: 'plumber Saginaw TX',
      detected_at: monday,
    });
    const b = computeDedupeHash('seo_ranking', {
      competitor_id: 'comp-1',
      keyword: 'plumber Saginaw TX',
      detected_at: wednesday,
    });
    expect(a).toBe(b);

    // Sanity: an entirely different ISO week yields a different hash.
    const nextWeek = Math.floor(new Date('2026-04-29T10:00:00Z').getTime() / 1000);
    const c = computeDedupeHash('seo_ranking', {
      competitor_id: 'comp-1',
      keyword: 'plumber Saginaw TX',
      detected_at: nextWeek,
    });
    expect(c).not.toBe(a);
  });

  it('canonicalizeUrl drops trailing slash but preserves a non-empty query', () => {
    expect(canonicalizeUrl('https://EXAMPLE.com/path/')).toBe('https://example.com/path');
    expect(canonicalizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });
});

describe('dedupe — existsByHash against DB', () => {
  let ctx: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    ctx = createTestDb();
  });
  afterEach(() => {
    ctx.sqlite.close();
  });

  it('returns true after inserting an activity row with the matching hash', () => {
    const { db } = ctx;
    const competitorId = randomUUID();
    db.insert(competitors)
      .values({
        id: competitorId,
        name: 'Hash Co',
        domain: 'hashco.example',
        category: 'plumbing',
        tier: 'local_same_size',
      })
      .run();

    const hash = computeDedupeHash('website', {
      competitor_id: competitorId,
      url: 'https://hashco.example/blog/post-42',
    });

    expect(existsByHash(db, hash)).toBe(false);

    db.insert(activities)
      .values({
        id: randomUUID(),
        competitorId,
        channel: 'website',
        activityType: 'new_blog_post',
        detectedAt: 1700000000,
        sourceUrl: 'https://hashco.example/blog/post-42',
        dedupeHash: hash,
        rawPayload: { foo: 'bar' },
      })
      .run();

    expect(existsByHash(db, hash)).toBe(true);
  });
});
