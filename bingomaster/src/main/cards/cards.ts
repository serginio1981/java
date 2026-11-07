/** Cartones propios (generados) y externos (digitados o leídos con IA). */
import { getRandomValues } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gridKey, positionIndex, randomGrid, validateGrid, type Grid, type Rng } from '../../shared/bingo/grid';
import type { CardSummary, CardView, ExternalCardInput } from '../../shared/ipc/contract';
import type { IndexedCard } from '../../shared/validation/validate';
import { transaction, type Db } from '../db/database';
import { appError } from '../errors';
import { getEvent } from '../events/events';

/** Máximo por generación (se puede generar varias veces: la numeración continúa). */
export const MAX_PER_GENERATION = 50_000;

interface Row {
  id: number;
  series_code: string;
  folio: string;
  grid_json: string;
  origin: 'own' | 'external';
  source_image_path: string | null;
  created_at: string;
}

const toView = (r: Row): CardView => ({
  id: r.id,
  series: r.series_code,
  folio: r.folio,
  origin: r.origin,
  grid: JSON.parse(r.grid_json) as Grid,
  createdAt: r.created_at,
  hasImage: !!r.source_image_path,
});

export const formatOwnFolio = (seq: number): string => String(seq).padStart(4, '0');

/** Aleatorio criptográfico para que los cartones no sean predecibles. */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1024);
  let i = buf.length;
  return () => {
    if (i >= buf.length) { getRandomValues(buf); i = 0; }
    return (buf[i++] as number) / 4294967296;
  };
}

// ---------- índice en memoria para evaluar figuras rápido ----------
const indexCache = new Map<number, IndexedCard[]>();

export function cardIndex(db: Db, eventId: number): IndexedCard[] {
  let idx = indexCache.get(eventId);
  if (!idx) {
    const rows = db.prepare('SELECT id, grid_json FROM cards WHERE event_id = ?').all(eventId) as unknown as { id: number; grid_json: string }[];
    idx = rows.map((r) => ({ id: r.id, pos: positionIndex(JSON.parse(r.grid_json) as Grid) }));
    indexCache.set(eventId, idx);
  }
  return idx;
}

export function invalidateIndex(eventId?: number): void {
  if (eventId === undefined) indexCache.clear();
  else indexCache.delete(eventId);
}

// ---------- consultas ----------
export function getCard(db: Db, id: number): CardView | null {
  const r = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as Row | undefined;
  return r ? toView(r) : null;
}

export function cardImagePath(db: Db, id: number): string | null {
  const r = db.prepare('SELECT source_image_path FROM cards WHERE id = ?').get(id) as { source_image_path: string | null } | undefined;
  return r?.source_image_path ?? null;
}

export function summary(db: Db, eventId: number): CardSummary {
  const r = db
    .prepare(`SELECT SUM(origin = 'own') AS own, SUM(origin = 'external') AS ext, COALESCE(MAX(own_seq), 0) AS maxseq
              FROM cards WHERE event_id = ?`)
    .get(eventId) as { own: number | null; ext: number | null; maxseq: number };
  return { own: r.own ?? 0, external: r.ext ?? 0, nextOwnFolio: r.maxseq + 1 };
}

const norm = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

/**
 * Busca por folio (como lo dicta el jugador). Acepta "0012", "12",
 * "NOV26-0012" o "NOV26 12". Si el folio es numérico también coincide
 * ignorando ceros a la izquierda. Puede devolver varios (distinta serie).
 */
export function findByFolio(db: Db, eventId: number, input: string): CardView[] {
  const raw = input.trim();
  if (!raw) return [];
  const series = new Set(
    (db.prepare('SELECT DISTINCT series_code FROM cards WHERE event_id = ?').all(eventId) as unknown as { series_code: string }[])
      .map((r) => norm(r.series_code)),
  );
  let wantSeries: string | null = null;
  let folio = norm(raw);
  const m = /^(.+?)[-\s]+(\S+)$/.exec(raw);
  if (m && series.has(norm(m[1] as string))) { wantSeries = norm(m[1] as string); folio = norm(m[2] as string); }
  const numeric = /^\d{1,15}$/.test(folio) ? Number(folio) : null;
  const rows = db
    .prepare(`SELECT * FROM cards WHERE event_id = ?
                AND (UPPER(REPLACE(folio, ' ', '')) = ?
                     OR (? IS NOT NULL AND folio NOT GLOB '*[^0-9]*' AND folio <> '' AND CAST(folio AS INTEGER) = ?))
              ORDER BY origin DESC, series_code, id`)
    .all(eventId, folio, numeric, numeric) as unknown as Row[];
  return rows.filter((r) => wantSeries === null || norm(r.series_code) === wantSeries).map(toView);
}

export function listCards(db: Db, eventId: number, offset: number, limit: number, search?: string): { total: number; items: CardView[] } {
  if (search && search.trim()) {
    const found = findByFolio(db, eventId, search);
    return { total: found.length, items: found.slice(offset, offset + limit) };
  }
  const total = (db.prepare('SELECT COUNT(*) AS n FROM cards WHERE event_id = ?').get(eventId) as { n: number }).n;
  const items = (db
    .prepare(`SELECT * FROM cards WHERE event_id = ? ORDER BY origin DESC, COALESCE(own_seq, 0), id LIMIT ? OFFSET ?`)
    .all(eventId, Math.max(1, Math.min(500, limit)), Math.max(0, offset)) as unknown as Row[]).map(toView);
  return { total, items };
}

export function ownCardsInRange(db: Db, eventId: number, from?: number, to?: number): CardView[] {
  const lo = from ?? 1;
  const hi = to ?? Number.MAX_SAFE_INTEGER;
  return (db
    .prepare(`SELECT * FROM cards WHERE event_id = ? AND origin = 'own' AND own_seq BETWEEN ? AND ? ORDER BY own_seq`)
    .all(eventId, lo, hi) as unknown as Row[]).map(toView);
}

/** ¿Existe serie+folio en el evento? (ignora mayúsculas y espacios, no ceros). */
export function findExact(db: Db, eventId: number, series: string, folio: string): CardView | null {
  const r = db
    .prepare(`SELECT * FROM cards WHERE event_id = ?
                AND UPPER(REPLACE(series_code, ' ', '')) = ? AND UPPER(REPLACE(folio, ' ', '')) = ? LIMIT 1`)
    .get(eventId, norm(series), norm(folio)) as Row | undefined;
  return r ? toView(r) : null;
}

// ---------- altas ----------
export function generateOwnCards(db: Db, eventId: number, count: number, rng: Rng = cryptoRng()): { created: number; first: string; last: string } {
  const ev = getEvent(db, eventId);
  if (!ev) throw appError('evento', 'Evento inexistente');
  if (!Number.isInteger(count) || count < 1) throw appError('cartones', 'Indique cuántos cartones generar (1 o más)');
  if (count > MAX_PER_GENERATION) throw appError('cartones', `Máximo ${MAX_PER_GENERATION.toLocaleString('es')} por vez; puede repetir la generación`);
  const out = transaction(db, () => {
    const keys = new Set(
      (db.prepare('SELECT grid_json FROM cards WHERE event_id = ?').all(eventId) as unknown as { grid_json: string }[])
        .map((r) => gridKey(JSON.parse(r.grid_json) as Grid)),
    );
    const start = summary(db, eventId).nextOwnFolio;
    const ins = db.prepare(`INSERT INTO cards (event_id, series_code, folio, grid_json, origin, own_seq) VALUES (?, ?, ?, ?, 'own', ?)`);
    for (let i = 0; i < count; i++) {
      let g: Grid;
      let k: string;
      let tries = 0;
      do {
        g = randomGrid(rng);
        k = gridKey(g);
        if (++tries > 1000) throw appError('cartones', 'No se pudo generar un layout único');
      } while (keys.has(k));
      keys.add(k);
      ins.run(eventId, ev.seriesCode, formatOwnFolio(start + i), JSON.stringify(g), start + i);
    }
    return {
      created: count,
      first: `${ev.seriesCode}-${formatOwnFolio(start)}`,
      last: `${ev.seriesCode}-${formatOwnFolio(start + count - 1)}`,
    };
  });
  invalidateIndex(eventId);
  return out;
}

const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export function addExternalCard(db: Db, eventId: number, input: ExternalCardInput, imagesDir: string): CardView {
  if (input.confirmed !== true) throw appError('sin_confirmar', 'El cartón debe confirmarse antes de guardarse');
  if (!getEvent(db, eventId)) throw appError('evento', 'Evento inexistente');
  const series = input.series.trim().slice(0, 40);
  const folio = input.folio.trim().slice(0, 40);
  if (!folio) throw appError('folio', 'Falta el folio');
  const check = validateGrid(input.grid);
  if (!check.ok) throw appError('invalido', 'El cartón no es válido: ' + check.errors.join('. '));
  const dup = findExact(db, eventId, series, folio);
  if (dup) throw appError('duplicado', `Ya existe en el evento un cartón con serie "${dup.series}" y folio "${dup.folio}"`);
  const card = transaction(db, () => {
    const r = db
      .prepare(`INSERT INTO cards (event_id, series_code, folio, grid_json, origin) VALUES (?, ?, ?, ?, 'external')`)
      .run(eventId, series, folio, JSON.stringify(input.grid));
    const id = Number(r.lastInsertRowid);
    if (input.image?.base64) {
      const ext = EXT[input.image.mediaType] ?? '.jpg';
      const path = join(imagesDir, `card-${id}${ext}`);
      writeFileSync(path, Buffer.from(input.image.base64, 'base64'));
      db.prepare('UPDATE cards SET source_image_path = ? WHERE id = ?').run(path, id);
    }
    return getCard(db, id) as CardView;
  });
  invalidateIndex(eventId);
  return card;
}
