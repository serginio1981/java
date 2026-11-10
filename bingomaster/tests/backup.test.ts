import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCall } from '../src/main/calls/calls';
import { generateOwnCards } from '../src/main/cards/cards';
import { backupTo, inspectBackup, openDatabase } from '../src/main/db/database';
import { createEvent } from '../src/main/events/events';
import { listGames } from '../src/main/games/games';
import { ensureBuiltinPatterns } from '../src/main/patterns/patterns';
import { buildPublicState } from '../src/main/state/state';

describe('respaldo de la base de datos', () => {
  it('genera una copia completa que se puede abrir y reconoce', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bm-bk-'));
    const db = openDatabase(join(dir, 'origen.db'));
    ensureBuiltinPatterns(db);
    const ev = createEvent(db, { name: 'Respaldo', date: '2026-11-07', seriesCode: 'RES', accumulateCalls: true }).id;
    generateOwnCards(db, ev, 25);
    [3, 18, 40].forEach((n) => addCall(db, ev, n));
    const bk = join(dir, "respaldo con 'comilla'.db");
    backupTo(db, bk);
    db.close();
    expect(inspectBackup(bk)).toEqual({ ok: true, events: 1, cards: 25, version: expect.any(Number) });
    const copy = openDatabase(bk);
    expect(buildPublicState(copy).calls.map((c) => c.number)).toEqual([3, 18, 40]);
    expect(listGames(copy, ev)).toHaveLength(4);
    copy.close();
  });

  it('rechaza archivos que no son respaldos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bm-bk-'));
    const txt = join(dir, 'x.db');
    writeFileSync(txt, 'hola');
    expect(inspectBackup(txt)).toMatchObject({ ok: false });
    const other = openDatabase(':memory:');
    other.close();
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const foreign = join(dir, 'otra.db');
    const f = new DatabaseSync(foreign);
    f.exec('CREATE TABLE cosas (a)');
    f.close();
    expect(inspectBackup(foreign)).toMatchObject({ ok: false, error: expect.stringContaining('no es un respaldo') });
  });
});
