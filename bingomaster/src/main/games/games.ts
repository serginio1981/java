/** Secuencia de juegos de un evento. */
import type { CurrentGame, GameView } from '../../shared/ipc/contract';
import { transaction, type Db } from '../db/database';
import { appError } from '../errors';
import { getCurrentGameId, getEvent, setCurrentGameId } from '../events/events';
import { getPattern } from '../patterns/patterns';

interface Row { id: number; position: number; name: string; pattern_id: number; pattern_name: string; finished_at: string | null }

export function listGames(db: Db, eventId: number): GameView[] {
  const rows = db
    .prepare(`SELECT g.id, g.position, g.name, g.pattern_id, p.name AS pattern_name, g.finished_at
              FROM games g JOIN patterns p ON p.id = g.pattern_id
              WHERE g.event_id = ? ORDER BY g.position`)
    .all(eventId) as unknown as Row[];
  return rows.map((r) => ({ id: r.id, position: r.position, name: r.name, patternId: r.pattern_id, patternName: r.pattern_name, finished: r.finished_at !== null }));
}

export function getCurrentGame(db: Db, eventId: number): CurrentGame | null {
  const id = getCurrentGameId(db, eventId);
  if (id === null) return null;
  const games = listGames(db, eventId);
  const idx = games.findIndex((g) => g.id === id);
  const game = games[idx];
  if (!game) return null;
  const pattern = getPattern(db, game.patternId);
  if (!pattern) return null;
  return { game, index: idx + 1, total: games.length, pattern };
}

function gameOf(db: Db, eventId: number, gameId: number): GameView {
  const g = listGames(db, eventId).find((x) => x.id === gameId);
  if (!g) throw appError('juego', 'El juego no existe en este evento');
  return g;
}

function hasActivity(db: Db, gameId: number): boolean {
  const c = db.prepare('SELECT (SELECT COUNT(*) FROM calls WHERE game_id = ?) + (SELECT COUNT(*) FROM winners WHERE game_id = ?) AS n').get(gameId, gameId) as { n: number };
  return c.n > 0;
}

function checkName(name: string): string {
  const n = name.trim();
  if (!n) throw appError('juego', 'El juego necesita un nombre');
  return n.slice(0, 60);
}

export function addGame(db: Db, eventId: number, name: string, patternId: number): void {
  if (!getPattern(db, patternId)) throw appError('juego', 'Figura inexistente');
  transaction(db, () => {
    const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM games WHERE event_id = ?').get(eventId) as { m: number };
    const r = db.prepare('INSERT INTO games (event_id, position, name, pattern_id) VALUES (?, ?, ?, ?)').run(eventId, max.m + 1, checkName(name), patternId);
    if (getCurrentGameId(db, eventId) === null) setCurrentGameId(db, eventId, Number(r.lastInsertRowid));
  });
}

export function updateGame(db: Db, eventId: number, gameId: number, name: string, patternId: number): void {
  const g = gameOf(db, eventId, gameId);
  if (!getPattern(db, patternId)) throw appError('juego', 'Figura inexistente');
  const winners = db.prepare('SELECT COUNT(*) AS n FROM winners WHERE game_id = ?').get(gameId) as { n: number };
  if (winners.n > 0 && g.patternId !== patternId) throw appError('juego', 'El juego ya tiene ganadores: no se puede cambiar la figura');
  db.prepare('UPDATE games SET name = ?, pattern_id = ? WHERE id = ?').run(checkName(name), patternId, gameId);
}

export function removeGame(db: Db, eventId: number, gameId: number): void {
  gameOf(db, eventId, gameId);
  if (hasActivity(db, gameId)) throw appError('juego', 'El juego ya tiene números o ganadores: no se puede quitar');
  transaction(db, () => {
    const games = listGames(db, eventId);
    const idx = games.findIndex((g) => g.id === gameId);
    if (getCurrentGameId(db, eventId) === gameId) {
      const next = games[idx + 1] ?? games[idx - 1] ?? null;
      setCurrentGameId(db, eventId, next ? next.id : null);
    }
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
    renumber(db, eventId);
  });
}

function renumber(db: Db, eventId: number): void {
  const ids = listGames(db, eventId).map((g) => g.id);
  // Dos pasos para no chocar con UNIQUE(event_id, position).
  ids.forEach((id, i) => db.prepare('UPDATE games SET position = ? WHERE id = ?').run(-(i + 1), id));
  ids.forEach((id, i) => db.prepare('UPDATE games SET position = ? WHERE id = ?').run(i + 1, id));
}

export function moveGame(db: Db, eventId: number, gameId: number, dir: -1 | 1): void {
  const games = listGames(db, eventId);
  const i = games.findIndex((g) => g.id === gameId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= games.length) return;
  const a = games[i] as GameView;
  const b = games[j] as GameView;
  transaction(db, () => {
    db.prepare('UPDATE games SET position = ? WHERE id = ?').run(-1, a.id);
    db.prepare('UPDATE games SET position = ? WHERE id = ?').run(a.position, b.id);
    db.prepare('UPDATE games SET position = ? WHERE id = ?').run(b.position, a.id);
  });
}

/**
 * Termina el juego en curso, haya tenido ganador o no, y pasa al siguiente
 * juego pendiente. Si era el último, el evento queda sin juego en curso.
 * Devuelve el juego que queda en curso (o null).
 */
export function finishGame(db: Db, eventId: number): GameView | null {
  const cur = getCurrentGameId(db, eventId);
  if (cur === null) throw appError('juego', 'No hay un juego en curso');
  return transaction(db, () => {
    db.prepare("UPDATE games SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(cur);
    const games = listGames(db, eventId);
    const i = games.findIndex((g) => g.id === cur);
    const next = games.slice(i + 1).find((g) => !g.finished) ?? games.find((g) => !g.finished) ?? null;
    setCurrentGameId(db, eventId, next ? next.id : null);
    return next;
  });
}

/** Compatibilidad: "siguiente juego" = terminar el actual. */
export const nextGame = finishGame;

/** Carga la secuencia inicial en un evento sin juegos (p. ej. creado en una versión anterior). */
export function loadDefaultSequence(db: Db, eventId: number, names: string[]): void {
  if (listGames(db, eventId).length > 0) throw appError('juego', 'El evento ya tiene juegos');
  for (const n of names) {
    const p = db.prepare('SELECT id FROM patterns WHERE name = ? ORDER BY is_builtin DESC LIMIT 1').get(n) as { id: number } | undefined;
    if (p) addGame(db, eventId, `Juego ${listGames(db, eventId).length + 1}`, p.id);
  }
}

/** ¿El evento tiene juegos y todos están terminados? */
export function allGamesFinished(db: Db, eventId: number): boolean {
  const games = listGames(db, eventId);
  return games.length > 0 && games.every((g) => g.finished) && getCurrentGameId(db, eventId) === null;
}

export function setCurrentGame(db: Db, eventId: number, gameId: number): void {
  gameOf(db, eventId, gameId);
  if (!getEvent(db, eventId)) throw appError('evento', 'Evento inexistente');
  // Elegir un juego terminado lo reabre.
  db.prepare('UPDATE games SET finished_at = NULL WHERE id = ?').run(gameId);
  setCurrentGameId(db, eventId, gameId);
}
