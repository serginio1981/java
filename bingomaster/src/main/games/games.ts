/** Secuencia de juegos de un evento. */
import type { CurrentGame, GameView } from '../../shared/ipc/contract';
import { transaction, type Db } from '../db/database';
import { appError } from '../errors';
import { getCurrentGameId, getEvent, setCurrentGameId } from '../events/events';
import { getPattern } from '../patterns/patterns';

interface Row { id: number; position: number; name: string; pattern_id: number; pattern_name: string }

export function listGames(db: Db, eventId: number): GameView[] {
  const rows = db
    .prepare(`SELECT g.id, g.position, g.name, g.pattern_id, p.name AS pattern_name
              FROM games g JOIN patterns p ON p.id = g.pattern_id
              WHERE g.event_id = ? ORDER BY g.position`)
    .all(eventId) as unknown as Row[];
  return rows.map((r) => ({ id: r.id, position: r.position, name: r.name, patternId: r.pattern_id, patternName: r.pattern_name }));
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

export function nextGame(db: Db, eventId: number): void {
  const games = listGames(db, eventId);
  const cur = getCurrentGameId(db, eventId);
  const i = games.findIndex((g) => g.id === cur);
  const next = games[i + 1];
  if (!next) throw appError('juego', 'Este es el último juego de la secuencia');
  setCurrentGameId(db, eventId, next.id);
}

export function setCurrentGame(db: Db, eventId: number, gameId: number): void {
  gameOf(db, eventId, gameId);
  if (!getEvent(db, eventId)) throw appError('evento', 'Evento inexistente');
  setCurrentGameId(db, eventId, gameId);
}
