/**
 * Figuras. Tres tipos:
 * - mask:  máscara fija de 25 celdas (string "1"/"0" por filas).
 * - group: "cualquiera de" varias máscaras (se copian al crear el grupo).
 * - count: primeros N números (con o sin FREE).
 */
import { CENTER_INDEX, FULL_MASK, popcount } from '../bingo/grid';

export type PatternDef =
  | { type: 'mask'; mask: string }
  | { type: 'group'; masks: string[]; labels?: string[] }
  | { type: 'count'; n: number; freeCounts: boolean };

export interface PatternView {
  id: number;
  name: string;
  isBuiltin: boolean;
  def: PatternDef;
}

export function maskToInt(mask: string): number {
  if (!/^[01]{25}$/.test(mask)) throw new Error('Máscara inválida: deben ser 25 celdas');
  let m = 0;
  for (let i = 0; i < 25; i++) if (mask[i] === '1') m |= 1 << i;
  return m;
}

export function intToMask(m: number): string {
  let s = '';
  for (let i = 0; i < 25; i++) s += (m >>> i) & 1 ? '1' : '0';
  return s;
}

function fromCells(cells: number[]): string {
  let m = 0;
  for (const i of cells) m |= 1 << i;
  return intToMask(m);
}

const row = (r: number) => [0, 1, 2, 3, 4].map((c) => r * 5 + c);
const col = (c: number) => [0, 1, 2, 3, 4].map((r) => r * 5 + c);
const DIAG1 = [0, 6, 12, 18, 24];
const DIAG2 = [4, 8, 12, 16, 20];

export const MASKS = {
  rows: [0, 1, 2, 3, 4].map((r) => fromCells(row(r))),
  cols: [0, 1, 2, 3, 4].map((c) => fromCells(col(c))),
  diag1: fromCells(DIAG1),
  diag2: fromCells(DIAG2),
  x: fromCells([...DIAG1, ...DIAG2]),
  l: fromCells([...col(0), ...row(4)]),
  t: fromCells([...row(0), ...col(2)]),
  frame: fromCells([...row(0), ...row(4), ...col(0), ...col(4)]),
  full: intToMask(FULL_MASK),
};

const COLS = ['B', 'I', 'N', 'G', 'O'];

/** Biblioteca precargada (se inserta en la BD con is_builtin = 1). */
export const BUILTIN_PATTERNS: { name: string; def: PatternDef }[] = [
  { name: 'Primeros 3', def: { type: 'count', n: 3, freeCounts: false } },
  {
    name: 'Línea (cualquiera)',
    def: {
      type: 'group',
      masks: [...MASKS.rows, ...MASKS.cols, MASKS.diag1, MASKS.diag2],
      labels: [...[1, 2, 3, 4, 5].map((i) => `Fila ${i}`), ...COLS.map((c) => `Columna ${c}`), 'Diagonal \\', 'Diagonal /'],
    },
  },
  { name: 'Línea horizontal (cualquiera)', def: { type: 'group', masks: MASKS.rows, labels: [1, 2, 3, 4, 5].map((i) => `Fila ${i}`) } },
  { name: 'Columna (cualquiera)', def: { type: 'group', masks: MASKS.cols, labels: COLS.map((c) => `Columna ${c}`) } },
  ...COLS.map((c, i) => ({ name: `Columna ${c}`, def: { type: 'mask', mask: MASKS.cols[i] as string } as PatternDef })),
  { name: 'Diagonal', def: { type: 'group', masks: [MASKS.diag1, MASKS.diag2], labels: ['Diagonal \\', 'Diagonal /'] } },
  { name: 'X', def: { type: 'mask', mask: MASKS.x } },
  { name: 'L', def: { type: 'mask', mask: MASKS.l } },
  {
    name: 'L (cualquier orientación)',
    def: {
      type: 'group',
      masks: [
        MASKS.l,
        fromCells([...col(4), ...row(4)]),
        fromCells([...col(0), ...row(0)]),
        fromCells([...col(4), ...row(0)]),
      ],
      labels: ['L', 'L invertida', 'Γ', 'Γ invertida'],
    },
  },
  { name: 'T', def: { type: 'mask', mask: MASKS.t } },
  { name: 'Marco', def: { type: 'mask', mask: MASKS.frame } },
  { name: 'Cartón lleno', def: { type: 'mask', mask: MASKS.full } },
];

export function validatePatternDef(d: unknown): PatternDef {
  const x = d as PatternDef;
  if (!x || typeof x !== 'object') throw new Error('Figura inválida');
  if (x.type === 'mask') {
    const m = maskToInt(x.mask);
    if (m === 1 << CENTER_INDEX || m === 0) throw new Error('Marque al menos una celda además del FREE');
    return { type: 'mask', mask: intToMask(m) };
  }
  if (x.type === 'group') {
    if (!Array.isArray(x.masks) || x.masks.length < 2) throw new Error('Un grupo necesita al menos 2 máscaras');
    x.masks.forEach(maskToInt);
    return { type: 'group', masks: [...x.masks], labels: x.labels ? [...x.labels] : undefined };
  }
  if (x.type === 'count') {
    if (!Number.isInteger(x.n) || x.n < 1 || x.n > 25) throw new Error('N debe estar entre 1 y 25');
    if (!x.freeCounts && x.n > 24) throw new Error('Sin contar el FREE, N puede ser como máximo 24');
    return { type: 'count', n: x.n, freeCounts: !!x.freeCounts };
  }
  throw new Error('Tipo de figura desconocido');
}

/** Figura compilada a enteros para evaluar rápido sobre miles de cartones. */
export type Compiled =
  | { type: 'masks'; masks: number[] }
  | { type: 'count'; n: number; freeCounts: boolean };

export function compile(def: PatternDef): Compiled {
  if (def.type === 'count') return { type: 'count', n: def.n, freeCounts: def.freeCounts };
  const masks = def.type === 'mask' ? [def.mask] : def.masks;
  return { type: 'masks', masks: masks.map(maskToInt) };
}

/** ¿Cuántas celdas faltan como mínimo para completar? 0 = completa. */
export function missing(c: Compiled, marked: number): number {
  if (c.type === 'count') {
    const m = c.freeCounts ? marked : marked & ~(1 << CENTER_INDEX);
    return Math.max(0, c.n - popcount(m));
  }
  let best = 25;
  for (const m of c.masks) {
    const miss = popcount(m & ~marked);
    if (miss < best) best = miss;
    if (best === 0) break;
  }
  return best;
}

export const isComplete = (c: Compiled, marked: number): boolean => missing(c, marked) === 0;

/** Primera máscara completa (para resaltarla) o la más cercana. */
export function bestMask(c: Compiled, marked: number): number | null {
  if (c.type === 'count') return null;
  let best: number | null = null;
  let bestMiss = 26;
  for (const m of c.masks) {
    const miss = popcount(m & ~marked);
    if (miss < bestMiss) { bestMiss = miss; best = m; }
  }
  return best;
}

export function describe(def: PatternDef): string {
  if (def.type === 'count') return `Primeros ${def.n} números${def.freeCounts ? ' (el FREE cuenta)' : ''}`;
  if (def.type === 'group') return `Cualquiera de ${def.masks.length} figuras`;
  return 'Figura fija';
}
