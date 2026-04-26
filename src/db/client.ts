import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

let sqlite: Database.Database | undefined;
let db: Db | undefined;

function applyPragmas(conn: Database.Database) {
  conn.pragma('journal_mode = WAL');
  conn.pragma('synchronous = NORMAL');
  conn.pragma('foreign_keys = ON');
}

export function getSqlite(): Database.Database {
  if (sqlite) return sqlite;
  sqlite = new Database(env.DATABASE_PATH);
  applyPragmas(sqlite);
  return sqlite;
}

export function getDb(): Db {
  if (db) return db;
  const conn = getSqlite();
  db = drizzle(conn, { schema });
  return db;
}

export function pingDb(): { ok: boolean; error?: string } {
  try {
    const conn = sqlite ?? new Database(env.DATABASE_PATH);
    if (!sqlite) applyPragmas(conn);
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
