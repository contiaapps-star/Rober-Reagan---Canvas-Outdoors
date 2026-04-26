import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  activities,
  competitorHandles,
  competitors,
} from '../../src/db/schema.js';
import { createTestDb, listTables } from '../helpers/db.js';

const EXPECTED_TABLES = [
  'activities',
  'api_spend_log',
  'competitor_handles',
  'competitors',
  'inspiration_sources',
  'poll_runs',
  'session_state',
  'target_keywords',
  'users',
] as const;

describe('schema migrations', () => {
  it('migrate() applies cleanly and creates all 9 expected tables', () => {
    const { db: _db, sqlite } = createTestDb();
    const tables = listTables(sqlite);
    for (const t of EXPECTED_TABLES) {
      expect(tables).toContain(t);
    }
    expect(tables.length).toBe(EXPECTED_TABLES.length);
    sqlite.close();
  });
});

describe('competitors CRUD + cascade', () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  it('supports insert + select + update + delete with FK ON DELETE CASCADE', () => {
    const { db } = ctx;
    const competitorId = randomUUID();

    db.insert(competitors)
      .values({
        id: competitorId,
        name: 'Test Co',
        domain: 'test-co.example',
        category: 'plumbing',
        tier: 'local_same_size',
      })
      .run();

    db.insert(competitorHandles)
      .values({
        id: randomUUID(),
        competitorId,
        channel: 'meta_facebook',
        handle: 'testco_fb',
      })
      .run();

    const fetched = db
      .select()
      .from(competitors)
      .where(eq(competitors.id, competitorId))
      .all();
    expect(fetched).toHaveLength(1);
    expect(fetched[0]!.name).toBe('Test Co');

    db.update(competitors)
      .set({ name: 'Test Co Renamed' })
      .where(eq(competitors.id, competitorId))
      .run();
    const updated = db
      .select()
      .from(competitors)
      .where(eq(competitors.id, competitorId))
      .get();
    expect(updated?.name).toBe('Test Co Renamed');

    db.delete(competitors).where(eq(competitors.id, competitorId)).run();
    const remainingCompetitors = db.select().from(competitors).all();
    expect(remainingCompetitors).toHaveLength(0);

    const remainingHandles = db
      .select()
      .from(competitorHandles)
      .where(eq(competitorHandles.competitorId, competitorId))
      .all();
    expect(remainingHandles).toHaveLength(0);
  });
});

describe('activities constraints', () => {
  let ctx: ReturnType<typeof createTestDb>;
  let competitorId: string;

  beforeEach(() => {
    ctx = createTestDb();
    competitorId = randomUUID();
    ctx.db
      .insert(competitors)
      .values({
        id: competitorId,
        name: 'Cstrnt Co',
        domain: 'cstrnt.example',
        category: 'plumbing',
        tier: 'local_same_size',
      })
      .run();
  });

  afterEach(() => {
    ctx.sqlite.close();
  });

  it('throws UNIQUE constraint when two activities share the same dedupe_hash', () => {
    const { db } = ctx;
    const sharedHash = 'a'.repeat(64);
    const baseRow = {
      competitorId,
      channel: 'website' as const,
      activityType: 'new_blog_post' as const,
      detectedAt: 1700000000,
      sourceUrl: 'https://cstrnt.example/post-1',
      dedupeHash: sharedHash,
      rawPayload: { foo: 'bar' },
    };

    db.insert(activities)
      .values({ id: randomUUID(), ...baseRow })
      .run();

    expect(() =>
      db
        .insert(activities)
        .values({
          id: randomUUID(),
          ...baseRow,
          sourceUrl: 'https://cstrnt.example/post-2',
        })
        .run(),
    ).toThrowError(/UNIQUE constraint failed/i);
  });

  it('rejects competitor inserts with category outside the CHECK enum', () => {
    const { sqlite } = ctx;
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO competitors (id, name, domain, category, tier)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          'Bad Co',
          'badco.example',
          'invalid',
          'local_same_size',
        ),
    ).toThrowError(/CHECK constraint failed/i);
  });

  it('round-trips JSON payload as a structured object', () => {
    const { db } = ctx;
    const id = randomUUID();
    const payload = {
      headline: 'X',
      tags: ['a', 'b'],
      meta: { likes: 42 },
    };

    db.insert(activities)
      .values({
        id,
        competitorId,
        channel: 'meta_facebook',
        activityType: 'new_ad_creative',
        detectedAt: 1700000000,
        sourceUrl: 'https://cstrnt.example/ad-json',
        dedupeHash: 'b'.repeat(64),
        rawPayload: payload,
      })
      .run();

    const row = db
      .select()
      .from(activities)
      .where(eq(activities.id, id))
      .get();
    expect(row).toBeDefined();
    expect(row!.rawPayload).toEqual(payload);
  });
});
