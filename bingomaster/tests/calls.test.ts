import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCall, listCurrentCalls, undoLastCall } from '../src/main/calls/calls';
import { openDatabase, type Db } from '../src/main/db/database';
import { createEvent, ensureActiveEvent, getActiveEvent } from '../src/main/events/events';
import { buildPublicState } from '../src/main/state/state';

function memDb(): { db: Db; eventId: number } {
  const db = openDatabase(':memory:');
  const ev = ensureActiveEvent(db, '2026-11-07');
  return { db, eventId: ev.id };
}

const numbers = (db: Db, id: number) => listCurrentCalls(db, id).map((c) => c.number);

describe('cantar números', () => {
  it('registra en orden con letra y posición', () => {
    const { db, eventId } = memDb();
    expect(addCall(db, eventId, 12)).toMatchObject({ ok: true, call: { number: 12, letter: 'B', seq: 1 } });
    expect(addCall(db, eventId, 75)).toMatchObject({ ok: true, call: { letter: 'O', seq: 2 } });
    expect(numbers(db, eventId)).toEqual([12, 75]);
  });

  it('rechaza repetidos y fuera de rango sin tocar el estado', () => {
    const { db, eventId } = memDb();
    addCall(db, eventId, 33);
    expect(addCall(db, eventId, 33)).toMatchObject({ ok: false, code: 'repetido' });
    expect(addCall(db, eventId, 0)).toMatchObject({ ok: false, code: 'rango' });
    expect(addCall(db, eventId, 76)).toMatchObject({ ok: false, code: 'rango' });
    expect(addCall(db, eventId, 4.5)).toMatchObject({ ok: false, code: 'rango' });
    expect(numbers(db, eventId)).toEqual([33]);
  });

  it('la BD también rechaza números fuera de rango (CHECK)', () => {
    const { db, eventId } = memDb();
    expect(() => db.prepare('INSERT INTO calls (event_id, number) VALUES (?, ?)').run(eventId, 99)).toThrow();
  });
});

describe('deshacer', () => {
  it('quita solo el último y permite volver a cantarlo', () => {
    const { db, eventId } = memDb();
    [5, 20, 40].forEach((n) => addCall(db, eventId, n));
    expect(undoLastCall(db, eventId)).toMatchObject({ ok: true, undone: { number: 40, seq: 3 } });
    expect(numbers(db, eventId)).toEqual([5, 20]);
    expect(addCall(db, eventId, 40)).toMatchObject({ ok: true, call: { seq: 3 } });
  });

  it('sin números informa error', () => {
    const { db, eventId } = memDb();
    expect(undoLastCall(db, eventId)).toMatchObject({ ok: false, code: 'vacio' });
  });
});

describe('modo de acumulación', () => {
  it('si se reinicia por juego, los vigentes son solo los del juego actual', () => {
    const db = openDatabase(':memory:');
    const ev = createEvent(db, { name: 'Reinicio', date: '2026-11-07', seriesCode: 'R1', accumulateCalls: false });
    db.prepare("INSERT INTO patterns (name, type, definition_json) VALUES ('X', 'mask', '{}')").run();
    db.prepare("INSERT INTO games (event_id, position, name, pattern_id) VALUES (?, 1, 'J1', 1), (?, 2, 'J2', 1)").run(ev.id, ev.id);
    db.prepare('UPDATE events SET current_game_id = 1 WHERE id = ?').run(ev.id);
    addCall(db, ev.id, 7);
    addCall(db, ev.id, 8);
    db.prepare('UPDATE events SET current_game_id = 2 WHERE id = ?').run(ev.id);
    expect(numbers(db, ev.id)).toEqual([]);
    // En el juego 2 el 7 se puede volver a cantar.
    expect(addCall(db, ev.id, 7)).toMatchObject({ ok: true, call: { seq: 1 } });
  });

  it('si acumula (default), los números siguen vigentes al cambiar de juego', () => {
    const { db, eventId } = memDb();
    db.prepare("INSERT INTO patterns (name, type, definition_json) VALUES ('X', 'mask', '{}')").run();
    db.prepare("INSERT INTO games (event_id, position, name, pattern_id) VALUES (?, 1, 'J1', 1), (?, 2, 'J2', 1)").run(eventId, eventId);
    db.prepare('UPDATE events SET current_game_id = 1 WHERE id = ?').run(eventId);
    addCall(db, eventId, 7);
    db.prepare('UPDATE events SET current_game_id = 2 WHERE id = ?').run(eventId);
    expect(addCall(db, eventId, 7)).toMatchObject({ ok: false, code: 'repetido' });
  });
});

describe('recuperación de sesión', () => {
  it('al reabrir el archivo se recupera el evento activo y lo cantado', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bm-')), 'test.db');
    let db = openDatabase(path);
    const ev = ensureActiveEvent(db, '2026-11-07');
    [3, 18, 44].forEach((n) => addCall(db, ev.id, n));
    undoLastCall(db, ev.id);
    db.close();

    db = openDatabase(path);
    expect(getActiveEvent(db)?.id).toBe(ev.id);
    const s = buildPublicState(db);
    expect(s.calls.map((c) => c.number)).toEqual([3, 18]);
    expect(s.last?.number).toBe(18);
    expect(s.lastFive.map((c) => c.number)).toEqual([18, 3]);
    db.close();
  });

  it('las migraciones no se repiten al reabrir', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bm-')), 'm.db');
    openDatabase(path).close();
    const db = openDatabase(path);
    expect(db.prepare('SELECT version FROM schema_version').get()).toEqual({ version: 1 });
    db.close();
  });
});

describe('estado público', () => {
  it('últimos 5 del más reciente al más antiguo', () => {
    const { db, eventId } = memDb();
    [1, 2, 3, 4, 5, 6, 7].forEach((n) => addCall(db, eventId, n));
    const s = buildPublicState(db);
    expect(s.count).toBe(7);
    expect(s.lastFive.map((c) => c.number)).toEqual([7, 6, 5, 4, 3]);
  });
});
