/**
 * Cartón 5x5 americano. grid[col][fila]; col 0..4 = B,I,N,G,O.
 * Centro (col 2, fila 2) = null = FREE.
 * Índice de celda para máscaras: i = fila * 5 + col (por filas, 0..24).
 */
import { LETTERS, RANGES, type Letter } from './numbers';

export type Cell = number | null;
export type Grid = Cell[][];

export const SIZE = 5;
export const CENTER_INDEX = 12;
export const FULL_MASK = (1 << 25) - 1;

export const cellIndex = (col: number, row: number): number => row * SIZE + col;
export const isCenter = (col: number, row: number): boolean => col === 2 && row === 2;

/** Generador aleatorio inyectable (para pruebas reproducibles). */
export type Rng = () => number;

/** Mulberry32: PRNG simple y reproducible para pruebas. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDistinct(min: number, max: number, count: number, rng: Rng): number[] {
  const pool: number[] = [];
  for (let n = min; n <= max; n++) pool.push(n);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j] as number, pool[i] as number];
  }
  return pool.slice(0, count);
}

/** Cartón aleatorio válido. */
export function randomGrid(rng: Rng = Math.random): Grid {
  return LETTERS.map((l, col) => {
    const [min, max] = RANGES[l];
    const nums = pickDistinct(min, max, col === 2 ? 4 : 5, rng);
    if (col === 2) return [nums[0] as number, nums[1] as number, null, nums[2] as number, nums[3] as number];
    return nums;
  });
}

/** Clave canónica del layout (posiciones incluidas) para detectar duplicados. */
export function gridKey(g: Grid): string {
  return g.map((col) => col.map((v) => (v === null ? 'F' : String(v))).join(',')).join('|');
}

export interface GridCheck {
  ok: boolean;
  errors: string[];
  /** Claves "col,fila" con problema → motivo. */
  cells: Record<string, string>;
}

/** Valida estructura: 5x5, 24 números + FREE, rangos por columna, sin repetidos. */
export function validateGrid(g: unknown): GridCheck {
  const errors: string[] = [];
  const cells: Record<string, string> = {};
  if (!Array.isArray(g) || g.length !== SIZE) return { ok: false, errors: ['La grilla debe tener 5 columnas'], cells };
  const seen = new Map<number, string>();
  let count = 0;
  for (let c = 0; c < SIZE; c++) {
    const col = g[c];
    const letter = LETTERS[c] as Letter;
    if (!Array.isArray(col) || col.length !== SIZE) {
      errors.push(`La columna ${letter} debe tener 5 celdas`);
      continue;
    }
    const [min, max] = RANGES[letter];
    for (let r = 0; r < SIZE; r++) {
      const v = col[r];
      const k = `${c},${r}`;
      if (isCenter(c, r)) {
        if (v !== null) cells[k] = 'El centro debe ser FREE';
        continue;
      }
      if (v === null || v === undefined) { cells[k] = 'Celda vacía'; continue; }
      if (typeof v !== 'number' || !Number.isInteger(v)) { cells[k] = 'No es un número entero'; continue; }
      if (v < min || v > max) { cells[k] = `${letter} va de ${min} a ${max}`; continue; }
      count++;
      const prev = seen.get(v);
      if (prev) { cells[k] = 'Número repetido'; cells[prev] = 'Número repetido'; }
      else seen.set(v, k);
    }
  }
  const bad = Object.keys(cells).length;
  if (bad) errors.push(bad === 1 ? '1 celda con problema' : `${bad} celdas con problema`);
  if (!bad && count !== 24 && errors.length === 0) errors.push(`Se esperaban 24 números y hay ${count}`);
  return { ok: errors.length === 0, errors, cells };
}

export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => [null, null, null, null, null] as Cell[]);
}

/**
 * Índice por número: para cada número 1..75, la celda (0..24) donde está en
 * este cartón, o -1. Permite calcular lo marcado con operaciones de bits.
 */
export function positionIndex(g: Grid): Int8Array {
  const pos = new Int8Array(76).fill(-1);
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE; r++) {
      const v = g[c]?.[r];
      if (typeof v === 'number' && v >= 1 && v <= 75) pos[v] = cellIndex(c, r);
    }
  }
  return pos;
}

/** marcados = (números del cartón ∩ cantados) ∪ {FREE}, como máscara de 25 bits. */
export function markedMask(pos: Int8Array, called: Iterable<number>): number {
  let m = 1 << CENTER_INDEX;
  for (const n of called) {
    const p = pos[n];
    if (p !== undefined && p >= 0) m |= 1 << p;
  }
  return m;
}

export function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
