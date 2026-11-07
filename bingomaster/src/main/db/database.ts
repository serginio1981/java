/**
 * Persistencia con SQLite integrado en Node (node:sqlite), incluido en
 * Electron 45 (Node 24). Se eligió en vez de better-sqlite3 porque este no
 * publica binarios precompilados para Electron 45 y habría que compilarlo con
 * herramientas nativas en Windows. Ver README, sección "Decisiones".
 *
 * Cada comando corre en una transacción y se confirma en disco al terminar
 * (WAL + synchronous=FULL): ese es el autoguardado.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations';

export type Db = DatabaseSync;

export function openDatabase(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA synchronous = FULL;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  for (const [i, sql] of MIGRATIONS.entries()) {
    const target = i + 1;
    if (target <= version) continue;
    transaction(db, () => {
      db.exec(sql);
      db.prepare('UPDATE schema_version SET version = ?').run(target);
    });
    version = target;
  }
}

/** Ejecuta fn dentro de una transacción. Si lanza, se revierte todo. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMeta(db: Db, key: string, value: string | null): void {
  if (value === null) db.prepare('DELETE FROM app_meta WHERE key = ?').run(key);
  else db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
