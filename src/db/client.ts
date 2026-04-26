import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { env } from '../lib/env.js';

let sqlite: Database.Database | undefined;
let db: BetterSQLite3Database | undefined;

export function getDb(): BetterSQLite3Database {
  if (db) return db;
  sqlite = new Database(env.DATABASE_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite);
  return db;
}

export function pingDb(): { ok: boolean; error?: string } {
  try {
    const conn = sqlite ?? new Database(env.DATABASE_PATH);
    conn.prepare('SELECT 1 as ok').get();
    if (!sqlite) conn.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function closeDb(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = undefined;
    db = undefined;
  }
}
