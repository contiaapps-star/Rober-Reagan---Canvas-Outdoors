import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import {
  competitorHandles,
  competitors,
  inspirationSources,
  targetKeywords,
  type Competitor,
  type CompetitorHandle,
  type InspirationSource,
  type TargetKeyword,
} from '../db/schema.js';

export const HANDLE_CHANNELS = [
  'meta_facebook',
  'meta_instagram',
  'tiktok',
  'youtube',
  'google_ads',
] as const;

export type HandleChannel = (typeof HANDLE_CHANNELS)[number];

export type CompetitorWithHandles = Competitor & {
  handles: CompetitorHandle[];
};

export type CompetitorInput = {
  name: string;
  domain: string;
  category: 'well' | 'plumbing' | 'both';
  tier: 'local_same_size' | 'mondo_100m' | 'national' | 'inspiration';
  handles: Partial<Record<HandleChannel, string>>;
};

export type KeywordInput = {
  keyword: string;
  category: 'well' | 'plumbing' | 'both';
  isActive: boolean;
};

export type InspirationInput = {
  kind: 'account' | 'keyword_search';
  value: string;
  channel: 'tiktok' | 'youtube';
  isActive: boolean;
};

export function listCompetitors(db: Db, opts: { activeOnly?: boolean } = {}): CompetitorWithHandles[] {
  const rows = opts.activeOnly
    ? db.select().from(competitors).where(eq(competitors.isActive, true)).orderBy(competitors.name).all()
    : db.select().from(competitors).orderBy(competitors.name).all();

  if (rows.length === 0) return [];

  const handles = db.select().from(competitorHandles).all();
  const byCompetitor = new Map<string, CompetitorHandle[]>();
  for (const h of handles) {
    const arr = byCompetitor.get(h.competitorId) ?? [];
    arr.push(h);
    byCompetitor.set(h.competitorId, arr);
  }

  return rows.map((c) => ({ ...c, handles: byCompetitor.get(c.id) ?? [] }));
}

export function getCompetitor(db: Db, id: string): CompetitorWithHandles | null {
  const c = db.select().from(competitors).where(eq(competitors.id, id)).get();
  if (!c) return null;
  const handles = db
    .select()
    .from(competitorHandles)
    .where(eq(competitorHandles.competitorId, id))
    .all();
  return { ...c, handles };
}

export function competitorDomainExists(
  db: Db,
  domain: string,
  excludeId?: string,
): boolean {
  const row = db
    .select({ id: competitors.id })
    .from(competitors)
    .where(eq(competitors.domain, domain.toLowerCase()))
    .get();
  if (!row) return false;
  if (excludeId && row.id === excludeId) return false;
  return true;
}

function writeHandles(
  db: Db,
  competitorId: string,
  handles: Partial<Record<HandleChannel, string>>,
): void {
  db.delete(competitorHandles).where(eq(competitorHandles.competitorId, competitorId)).run();
  const rows = HANDLE_CHANNELS.flatMap((channel) => {
    const value = handles[channel]?.trim();
    if (!value) return [];
    return [
      {
        id: randomUUID(),
        competitorId,
        channel,
        handle: value,
        isActive: true,
      },
    ];
  });
  if (rows.length > 0) db.insert(competitorHandles).values(rows).run();
}

export function createCompetitor(db: Db, input: CompetitorInput): CompetitorWithHandles {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.insert(competitors)
    .values({
      id,
      name: input.name.trim(),
      domain: input.domain.trim().toLowerCase(),
      category: input.category,
      tier: input.tier,
      logoUrl: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  writeHandles(db, id, input.handles);
  return getCompetitor(db, id)!;
}

export function updateCompetitor(
  db: Db,
  id: string,
  input: CompetitorInput,
): CompetitorWithHandles | null {
  const existing = db.select().from(competitors).where(eq(competitors.id, id)).get();
  if (!existing) return null;
  const now = Math.floor(Date.now() / 1000);
  db.update(competitors)
    .set({
      name: input.name.trim(),
      domain: input.domain.trim().toLowerCase(),
      category: input.category,
      tier: input.tier,
      updatedAt: now,
    })
    .where(eq(competitors.id, id))
    .run();
  writeHandles(db, id, input.handles);
  return getCompetitor(db, id);
}

export function softDeleteCompetitor(db: Db, id: string): boolean {
  const existing = db.select().from(competitors).where(eq(competitors.id, id)).get();
  if (!existing) return false;
  const now = Math.floor(Date.now() / 1000);
  db.update(competitors)
    .set({ isActive: false, updatedAt: now })
    .where(eq(competitors.id, id))
    .run();
  return true;
}

export function listKeywords(db: Db, opts: { activeOnly?: boolean } = {}): TargetKeyword[] {
  if (opts.activeOnly) {
    return db
      .select()
      .from(targetKeywords)
      .where(eq(targetKeywords.isActive, true))
      .orderBy(targetKeywords.keyword)
      .all();
  }
  return db.select().from(targetKeywords).orderBy(targetKeywords.keyword).all();
}

export function getKeyword(db: Db, id: string): TargetKeyword | null {
  return db.select().from(targetKeywords).where(eq(targetKeywords.id, id)).get() ?? null;
}

export function keywordExists(db: Db, keyword: string, excludeId?: string): boolean {
  const rows = db
    .select({ id: targetKeywords.id })
    .from(targetKeywords)
    .where(eq(targetKeywords.keyword, keyword.trim()))
    .all();
  if (rows.length === 0) return false;
  if (excludeId) return rows.some((r) => r.id !== excludeId);
  return true;
}

export function createKeyword(db: Db, input: KeywordInput): TargetKeyword {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  db.insert(targetKeywords)
    .values({
      id,
      keyword: input.keyword.trim(),
      category: input.category,
      isActive: input.isActive,
      createdAt: now,
    })
    .run();
  return getKeyword(db, id)!;
}

export function updateKeyword(
  db: Db,
  id: string,
  input: KeywordInput,
): TargetKeyword | null {
  const existing = getKeyword(db, id);
  if (!existing) return null;
  db.update(targetKeywords)
    .set({
      keyword: input.keyword.trim(),
      category: input.category,
      isActive: input.isActive,
    })
    .where(eq(targetKeywords.id, id))
    .run();
  return getKeyword(db, id);
}

export function softDeleteKeyword(db: Db, id: string): boolean {
  const existing = getKeyword(db, id);
  if (!existing) return false;
  db.update(targetKeywords)
    .set({ isActive: false })
    .where(eq(targetKeywords.id, id))
    .run();
  return true;
}

export function listInspiration(
  db: Db,
  opts: { activeOnly?: boolean } = {},
): InspirationSource[] {
  if (opts.activeOnly) {
    return db
      .select()
      .from(inspirationSources)
      .where(eq(inspirationSources.isActive, true))
      .orderBy(inspirationSources.value)
      .all();
  }
  return db.select().from(inspirationSources).orderBy(inspirationSources.value).all();
}

export function getInspiration(db: Db, id: string): InspirationSource | null {
  return (
    db.select().from(inspirationSources).where(eq(inspirationSources.id, id)).get() ??
    null
  );
}

export function inspirationExists(
  db: Db,
  channel: 'tiktok' | 'youtube',
  value: string,
  excludeId?: string,
): boolean {
  const rows = db
    .select({ id: inspirationSources.id })
    .from(inspirationSources)
    .where(
      and(
        eq(inspirationSources.channel, channel),
        eq(inspirationSources.value, value.trim()),
      ),
    )
    .all();
  if (rows.length === 0) return false;
  if (excludeId) return rows.some((r) => r.id !== excludeId);
  return true;
}

export function createInspiration(db: Db, input: InspirationInput): InspirationSource {
  const id = randomUUID();
  db.insert(inspirationSources)
    .values({
      id,
      kind: input.kind,
      value: input.value.trim(),
      channel: input.channel,
      isActive: input.isActive,
    })
    .run();
  return getInspiration(db, id)!;
}

export function updateInspiration(
  db: Db,
  id: string,
  input: InspirationInput,
): InspirationSource | null {
  const existing = getInspiration(db, id);
  if (!existing) return null;
  db.update(inspirationSources)
    .set({
      kind: input.kind,
      value: input.value.trim(),
      channel: input.channel,
      isActive: input.isActive,
    })
    .where(eq(inspirationSources.id, id))
    .run();
  return getInspiration(db, id);
}

export function softDeleteInspiration(db: Db, id: string): boolean {
  const existing = getInspiration(db, id);
  if (!existing) return false;
  db.update(inspirationSources)
    .set({ isActive: false })
    .where(eq(inspirationSources.id, id))
    .run();
  return true;
}
