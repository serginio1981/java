import type { EventView } from '../../shared/ipc/contract';
import { getMeta, setMeta, transaction, type Db } from '../db/database';

const ACTIVE_KEY = 'active_event_id';

interface EventRow {
  id: number;
  name: string;
  date: string;
  series_code: string;
  accumulate_calls: number;
  current_game_id: number | null;
}

function toView(r: EventRow): EventView {
  return {
    id: r.id,
    name: r.name,
    date: r.date,
    seriesCode: r.series_code,
    accumulateCalls: r.accumulate_calls === 1,
  };
}

export interface NewEvent {
  name: string;
  date: string;
  seriesCode: string;
  accumulateCalls?: boolean;
}

export function createEvent(db: Db, e: NewEvent): EventView {
  const name = e.name.trim();
  const series = e.seriesCode.trim().toUpperCase();
  if (!name) throw new Error('El evento necesita un nombre');
  if (!/^[A-Z0-9]{1,12}$/.test(series)) throw new Error('El código de serie debe tener 1 a 12 letras o números');
  return transaction(db, () => {
    const r = db
      .prepare('INSERT INTO events (name, date, series_code, accumulate_calls) VALUES (?, ?, ?, ?)')
      .run(name, e.date, series, e.accumulateCalls === false ? 0 : 1);
    const id = Number(r.lastInsertRowid);
    setMeta(db, ACTIVE_KEY, String(id));
    return getEvent(db, id) as EventView;
  });
}

export function getEvent(db: Db, id: number): EventView | null {
  const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
  return r ? toView(r) : null;
}

export function getActiveEvent(db: Db): EventView | null {
  const id = getMeta(db, ACTIVE_KEY);
  return id ? getEvent(db, Number(id)) : null;
}

export function getCurrentGameId(db: Db, eventId: number): number | null {
  const r = db.prepare('SELECT current_game_id FROM events WHERE id = ?').get(eventId) as
    | { current_game_id: number | null }
    | undefined;
  return r?.current_game_id ?? null;
}

/**
 * F1: si no hay evento activo se crea uno de prueba para poder cantar números.
 * En F2 la creación de eventos pasa a la interfaz.
 */
export function ensureActiveEvent(db: Db, today: string): EventView {
  return getActiveEvent(db) ?? createEvent(db, { name: 'Evento de prueba', date: today, seriesCode: 'PRUEBA' });
}
