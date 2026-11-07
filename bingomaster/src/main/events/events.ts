import type { EventView, NewEventInput } from '../../shared/ipc/contract';
import { getMeta, setMeta, transaction, type Db } from '../db/database';
import { appError } from '../errors';
import { findPatternByName } from '../patterns/patterns';

const ACTIVE_KEY = 'active_event_id';

/** Secuencia inicial de un evento nuevo (editable después). */
export const DEFAULT_SEQUENCE = ['Primeros 3', 'Línea (cualquiera)', 'X', 'Cartón lleno'];

interface EventRow {
  id: number;
  name: string;
  date: string;
  series_code: string;
  accumulate_calls: number;
  current_game_id: number | null;
}

function toView(r: EventRow): EventView {
  return { id: r.id, name: r.name, date: r.date, seriesCode: r.series_code, accumulateCalls: r.accumulate_calls === 1 };
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw appError('evento', 'El evento necesita un nombre');
  if (n.length > 80) throw appError('evento', 'Nombre demasiado largo (máx. 80)');
  return n;
}

function cleanDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw appError('evento', 'Fecha inválida (use AAAA-MM-DD)');
  return d;
}

export function createEvent(db: Db, e: NewEventInput, opts: { defaultSequence?: boolean } = {}): EventView {
  const name = cleanName(e.name);
  const date = cleanDate(e.date);
  const series = e.seriesCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(series)) throw appError('evento', 'El código de serie debe tener 1 a 12 letras o números, sin espacios');
  return transaction(db, () => {
    const r = db
      .prepare('INSERT INTO events (name, date, series_code, accumulate_calls) VALUES (?, ?, ?, ?)')
      .run(name, date, series, e.accumulateCalls === false ? 0 : 1);
    const id = Number(r.lastInsertRowid);
    if (opts.defaultSequence !== false) {
      let pos = 1;
      for (const pn of DEFAULT_SEQUENCE) {
        const p = findPatternByName(db, pn);
        if (p) db.prepare('INSERT INTO games (event_id, position, name, pattern_id) VALUES (?, ?, ?, ?)').run(id, pos, `Juego ${pos}`, p.id);
        pos++;
      }
      const first = db.prepare('SELECT id FROM games WHERE event_id = ? ORDER BY position LIMIT 1').get(id) as { id: number } | undefined;
      if (first) db.prepare('UPDATE events SET current_game_id = ? WHERE id = ?').run(first.id, id);
    }
    setMeta(db, ACTIVE_KEY, String(id));
    return getEvent(db, id) as EventView;
  });
}

export function updateEvent(db: Db, id: number, u: { name: string; date: string; accumulateCalls: boolean }): void {
  const ev = getEvent(db, id);
  if (!ev) throw appError('evento', 'El evento no existe');
  if (ev.accumulateCalls !== u.accumulateCalls) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM calls WHERE event_id = ?').get(id) as { n: number };
    if (n.n > 0) throw appError('evento', 'No se puede cambiar el modo de acumulación cuando ya hay números cantados');
  }
  db.prepare('UPDATE events SET name = ?, date = ?, accumulate_calls = ? WHERE id = ?').run(
    cleanName(u.name), cleanDate(u.date), u.accumulateCalls ? 1 : 0, id,
  );
}

export function listEvents(db: Db): EventView[] {
  return (db.prepare('SELECT * FROM events ORDER BY date DESC, id DESC').all() as unknown as EventRow[]).map(toView);
}

export function getEvent(db: Db, id: number): EventView | null {
  const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
  return r ? toView(r) : null;
}

export function activateEvent(db: Db, id: number): void {
  if (!getEvent(db, id)) throw appError('evento', 'El evento no existe');
  setMeta(db, ACTIVE_KEY, String(id));
}

export function getActiveEvent(db: Db): EventView | null {
  const id = getMeta(db, ACTIVE_KEY);
  return id ? getEvent(db, Number(id)) : null;
}

export function getCurrentGameId(db: Db, eventId: number): number | null {
  const r = db.prepare('SELECT current_game_id FROM events WHERE id = ?').get(eventId) as { current_game_id: number | null } | undefined;
  return r?.current_game_id ?? null;
}

export function setCurrentGameId(db: Db, eventId: number, gameId: number | null): void {
  db.prepare('UPDATE events SET current_game_id = ? WHERE id = ?').run(gameId, eventId);
}

/** Si no hay evento activo se crea uno de prueba para poder empezar. */
export function ensureActiveEvent(db: Db, today: string): EventView {
  return getActiveEvent(db) ?? createEvent(db, { name: 'Evento de prueba', date: today, seriesCode: 'PRUEBA', accumulateCalls: true });
}
