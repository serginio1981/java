/**
 * Validación de un "¡bingo!". Usa solo lo cantado en la app, nunca lo
 * marcado a lápiz. Igual para cartones propios y externos.
 *
 * Regla del cliente: el bingo es válido solo si la figura se completó
 * justamente con el ÚLTIMO número cantado.
 */
import { CENTER_INDEX, markedMask, positionIndex, type Grid } from '../bingo/grid';
import { bestMask, isComplete, missing, type Compiled } from '../patterns/patterns';

export interface ClaimResult {
  valid: boolean;
  /** La figura está completa con lo cantado hasta ahora. */
  complete: boolean;
  /** Posición (1-based) del número con que se completó por primera vez; null si no está completa. */
  completedAtSeq: number | null;
  callsCount: number;
  /** Máscara de 25 bits de lo marcado (incluye FREE). */
  marked: number;
  /** Máscara a resaltar: la figura cumplida o la más cercana (null en "por cantidad"). */
  target: number | null;
  /** Celdas que faltan de la figura más cercana. */
  missingCount: number;
  reason: string;
}

/** calls: números vigentes en orden de salida. */
export function validateClaim(grid: Grid, calls: readonly number[], pattern: Compiled): ClaimResult {
  const pos = positionIndex(grid);
  const marked = markedMask(pos, calls);
  const miss = missing(pattern, marked);
  const complete = miss === 0;

  let completedAtSeq: number | null = null;
  if (complete) {
    let m = 1 << CENTER_INDEX;
    if (isComplete(pattern, m)) completedAtSeq = 0;
    else {
      for (let i = 0; i < calls.length; i++) {
        const p = pos[calls[i] as number];
        if (p !== undefined && p >= 0) m |= 1 << p;
        if (isComplete(pattern, m)) { completedAtSeq = i + 1; break; }
      }
    }
  }
  const valid = complete && completedAtSeq === calls.length && calls.length > 0;
  let reason: string;
  if (!complete) reason = miss === 1 ? 'Falta 1 número para completar la figura' : `Faltan ${miss} números para completar la figura`;
  else if (valid) reason = `Completó la figura con el último número cantado (número ${calls.length})`;
  else reason = `La figura se completó en el número ${completedAtSeq}, no con el último (${calls.length}). Según la regla, no es válido.`;

  return {
    valid,
    complete,
    completedAtSeq,
    callsCount: calls.length,
    marked,
    target: bestMask(pattern, marked),
    missingCount: miss,
    reason,
  };
}

export interface IndexedCard {
  id: number;
  pos: Int8Array;
}

/** Resumen solo para el operador: cartones completos y a 1 número. */
export function summarize(cards: readonly IndexedCard[], calls: readonly number[], pattern: Compiled): { complete: number; oneAway: number } {
  let complete = 0;
  let oneAway = 0;
  for (const c of cards) {
    const miss = missing(pattern, markedMask(c.pos, calls));
    if (miss === 0) complete++;
    else if (miss === 1) oneAway++;
  }
  return { complete, oneAway };
}
