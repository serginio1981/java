/**
 * Números cantados. "Vigentes" = los que cuentan para validar:
 * - evento que acumula: todos los del evento;
 * - evento que reinicia por juego: solo los del juego actual.
 */
import { isValidNumber, label, letterFor } from '../../shared/bingo/numbers';
import type { CallView, Result } from '../../shared/ipc/contract';
import { transaction, type Db } from '../db/database';
import { getCurrentGameId, getEvent } from '../events/events';

interface CallRow {
  id: number;
  number: number;
  called_at: string;
}

export function listCurrentCalls(db: Db, eventId: number): CallView[] {
  const ev = getEvent(db, eventId);
  if (!ev) return [];
  const gameId = getCurrentGameId(db, eventId);
  const rows = (
    ev.accumulateCalls
      ? db.prepare('SELECT id, number, called_at FROM calls WHERE event_id = ? ORDER BY id').all(eventId)
      : db
          .prepare('SELECT id, number, called_at FROM calls WHERE event_id = ? AND game_id IS ? ORDER BY id')
          .all(eventId, gameId)
  ) as unknown as CallRow[];
  return rows.map((r, i) => ({
    id: r.id,
    number: r.number,
    letter: letterFor(r.number),
    seq: i + 1,
    calledAt: r.called_at,
  }));
}

export function addCall(db: Db, eventId: number, n: number): Result<{ call: CallView }> {
  if (!isValidNumber(n)) {
    return { ok: false, code: 'rango', error: `${String(n)} está fuera de rango (1 a 75)` };
  }
  return transaction(db, () => {
    if (!getEvent(db, eventId)) return { ok: false, code: 'evento', error: 'No hay un evento activo' };
    const current = listCurrentCalls(db, eventId);
    const prev = current.find((c) => c.number === n);
    if (prev) {
      return { ok: false, code: 'repetido', error: `${label(n)} ya salió (fue el número ${prev.seq})` };
    }
    db.prepare('INSERT INTO calls (event_id, game_id, number) VALUES (?, ?, ?)').run(
      eventId,
      getCurrentGameId(db, eventId),
      n,
    );
    const after = listCurrentCalls(db, eventId);
    return { ok: true, call: after[after.length - 1] as CallView };
  });
}

/**
 * Deshace el último número vigente. Solo números del juego actual: un número
 * de un juego anterior (que pudo dar ganadores) no se deshace.
 */
export function undoLastCall(db: Db, eventId: number): Result<{ undone: CallView }> {
  return transaction(db, () => {
    const current = listCurrentCalls(db, eventId);
    const last = current[current.length - 1];
    if (!last) return { ok: false, code: 'vacio', error: 'No hay números para deshacer' };
    const row = db.prepare('SELECT game_id FROM calls WHERE id = ?').get(last.id) as { game_id: number | null };
    if (row.game_id !== getCurrentGameId(db, eventId)) {
      return { ok: false, code: 'otro_juego', error: `${label(last.number)} es de un juego anterior: no se puede deshacer` };
    }
    db.prepare('DELETE FROM calls WHERE id = ?').run(last.id);
    return { ok: true, undone: last };
  });
}
