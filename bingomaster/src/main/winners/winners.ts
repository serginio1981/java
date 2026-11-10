/** Validación de "¡bingo!" y registro de ganadores. */
import type { ClaimView, WinnerView } from '../../shared/ipc/contract';
import { compile } from '../../shared/patterns/patterns';
import { validateClaim } from '../../shared/validation/validate';
import { listCurrentCalls } from '../calls/calls';
import { getCard } from '../cards/cards';
import type { Db } from '../db/database';
import { appError } from '../errors';
import { getCurrentGame } from '../games/games';

export function checkClaim(db: Db, eventId: number, cardId: number): ClaimView {
  const card = getCard(db, cardId);
  if (!card) throw appError('carton', 'El cartón no existe');
  const cur = getCurrentGame(db, eventId);
  if (!cur) throw appError('juego', 'No hay un juego en curso: configure la secuencia de juegos');
  const calls = listCurrentCalls(db, eventId).map((c) => c.number);
  const r = validateClaim(card.grid, calls, compile(cur.pattern.def));
  const already = db.prepare('SELECT 1 FROM winners WHERE game_id = ? AND card_id = ?').get(cur.game.id, cardId);
  return { card, game: cur.game, pattern: cur.pattern, ...r, alreadyWinner: !!already };
}

/** Registra un ganador solo si la validación da VÁLIDO en este momento. */
export function registerWinner(db: Db, eventId: number, cardId: number): WinnerView {
  const claim = checkClaim(db, eventId, cardId);
  if (claim.alreadyWinner) throw appError('ganador', 'Este cartón ya está registrado como ganador de este juego');
  if (!claim.valid) throw appError('no_valido', 'No se puede registrar: ' + claim.reason);
  const r = db
    .prepare('INSERT INTO winners (event_id, game_id, card_id, calls_count) VALUES (?, ?, ?, ?)')
    .run(eventId, claim.game.id, cardId, claim.callsCount);
  return listWinners(db, eventId).find((w) => w.id === Number(r.lastInsertRowid)) as WinnerView;
}

export function setWinnerNote(db: Db, eventId: number, winnerId: number, note: string): void {
  const r = db.prepare('UPDATE winners SET note = ? WHERE id = ? AND event_id = ?').run(note.trim().slice(0, 200) || null, winnerId, eventId);
  if (r.changes === 0) throw appError('ganador', 'Ganador inexistente');
}

export function listWinners(db: Db, eventId: number): WinnerView[] {
  const rows = db
    .prepare(`SELECT w.id, w.game_id, g.name AS game_name, g.position, w.card_id, c.series_code, c.folio, c.origin,
                     w.calls_count, w.note, w.created_at
              FROM winners w JOIN games g ON g.id = w.game_id JOIN cards c ON c.id = w.card_id
              WHERE w.event_id = ? ORDER BY g.position, w.id`)
    .all(eventId) as unknown as {
      id: number; game_id: number; game_name: string; card_id: number; series_code: string; folio: string;
      origin: 'own' | 'external'; calls_count: number; note: string | null; created_at: string;
    }[];
  return rows.map((r) => ({
    id: r.id, gameId: r.game_id, gameName: r.game_name, cardId: r.card_id, series: r.series_code, folio: r.folio,
    origin: r.origin, callsCount: r.calls_count, note: r.note, createdAt: r.created_at,
  }));
}
