import { describe, expect, it } from 'vitest';
import {
  CENTER_INDEX, gridKey, markedMask, popcount, positionIndex, randomGrid, seededRng, validateGrid, type Grid,
} from '../src/shared/bingo/grid';
import { RANGES } from '../src/shared/bingo/numbers';
import {
  BUILTIN_PATTERNS, compile, intToMask, isComplete, maskToInt, MASKS, missing, validatePatternDef,
} from '../src/shared/patterns/patterns';

// Cartón fijo para pruebas (por columnas).
export const SAMPLE: Grid = [
  [1, 2, 3, 4, 5],
  [16, 17, 18, 19, 20],
  [31, 32, null, 34, 35],
  [46, 47, 48, 49, 50],
  [61, 62, 63, 64, 65],
];
const mark = (calls: number[]) => markedMask(positionIndex(SAMPLE), calls);
const pattern = (name: string) => compile(BUILTIN_PATTERNS.find((p) => p.name === name)!.def);

describe('generación de cartones', () => {
  it('cada cartón tiene rangos correctos, 24 números + FREE y sin repetidos', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 2000; i++) {
      const g = randomGrid(rng);
      expect(validateGrid(g).ok).toBe(true);
      expect(g[2]?.[2]).toBeNull();
      Object.values(RANGES).forEach(([min, max], c) => {
        expect(g[c]!.every((v, r) => (c === 2 && r === 2) || (v! >= min && v! <= max))).toBe(true);
      });
    }
  });

  it('gridKey distingue posiciones y es estable', () => {
    const a = randomGrid(seededRng(1));
    const b = a.map((c) => [...c]);
    expect(gridKey(a)).toBe(gridKey(b));
    [b[0]![0], b[0]![1]] = [b[0]![1]!, b[0]![0]!];
    expect(gridKey(a)).not.toBe(gridKey(b));
  });

  it('validateGrid detecta rango, repetido, vacío y centro', () => {
    const g = SAMPLE.map((c) => [...c]);
    g[0]![0] = 16;
    g[1]![1] = 16;
    g[3]![0] = null;
    g[2]![2] = 33;
    const v = validateGrid(g);
    expect(v.ok).toBe(false);
    expect(v.cells['0,0']).toMatch(/B va de 1 a 15/);
    expect(v.cells['3,0']).toBe('Celda vacía');
    expect(v.cells['2,2']).toBe('El centro debe ser FREE');
  });
});

describe('marcados', () => {
  it('incluye siempre el FREE y solo números del cartón', () => {
    expect(mark([])).toBe(1 << CENTER_INDEX);
    expect(popcount(mark([1, 16, 99 - 24, 70]))).toBe(3);
  });
});

describe('figuras', () => {
  it('máscara fija: columna B', () => {
    const p = pattern('Columna B');
    expect(isComplete(p, mark([1, 2, 3, 4]))).toBe(false);
    expect(missing(p, mark([1, 2, 3, 4]))).toBe(1);
    expect(isComplete(p, mark([1, 2, 3, 4, 5]))).toBe(true);
  });

  it('máscara fija con FREE: columna N necesita solo 4 números', () => {
    expect(isComplete(pattern('Columna N'), mark([31, 32, 34, 35]))).toBe(true);
  });

  it('grupo: Línea (cualquiera) incluye filas, columnas y diagonales', () => {
    const p = pattern('Línea (cualquiera)');
    expect(isComplete(p, mark([1, 16, 31, 46, 61]))).toBe(true); // fila 1
    expect(isComplete(p, mark([61, 62, 63, 64, 65]))).toBe(true); // columna O
    expect(isComplete(p, mark([1, 17, 49, 65]))).toBe(true); // diagonal con FREE
    expect(isComplete(p, mark([1, 17, 49]))).toBe(false);
    expect(missing(p, mark([1, 17, 49]))).toBe(1);
  });

  it('grupo: Diagonal, X, Marco y Cartón lleno', () => {
    expect(isComplete(pattern('Diagonal'), mark([5, 19, 47, 61]))).toBe(true);
    expect(isComplete(pattern('X'), mark([1, 17, 49, 65, 5, 19, 47]))).toBe(false);
    expect(isComplete(pattern('X'), mark([1, 17, 49, 65, 5, 19, 47, 61]))).toBe(true);
    const frame = [1, 2, 3, 4, 5, 61, 62, 63, 64, 65, 16, 31, 46, 20, 35, 50];
    expect(isComplete(pattern('Marco'), mark(frame))).toBe(true);
    const all = SAMPLE.flat().filter((v): v is number => v !== null);
    expect(isComplete(pattern('Cartón lleno'), mark(all.slice(1)))).toBe(false);
    expect(isComplete(pattern('Cartón lleno'), mark(all))).toBe(true);
  });

  it('por cantidad: primeros N con y sin FREE', () => {
    const sin = compile({ type: 'count', n: 3, freeCounts: false });
    const con = compile({ type: 'count', n: 3, freeCounts: true });
    expect(isComplete(sin, mark([1, 70, 16]))).toBe(false); // 70 no está
    expect(isComplete(con, mark([1, 70, 16]))).toBe(true); // 2 + FREE
    expect(isComplete(sin, mark([1, 16, 31]))).toBe(true);
  });

  it('L en cualquier orientación', () => {
    const p = pattern('L (cualquier orientación)');
    // columna O + fila superior
    expect(isComplete(p, mark([61, 62, 63, 64, 65, 1, 16, 31, 46]))).toBe(true);
  });

  it('máscara ida y vuelta y validaciones del editor', () => {
    expect(intToMask(maskToInt(MASKS.x))).toBe(MASKS.x);
    expect(() => maskToInt('101')).toThrow();
    expect(() => validatePatternDef({ type: 'mask', mask: '0'.repeat(25) })).toThrow();
    expect(() => validatePatternDef({ type: 'group', masks: [MASKS.x] })).toThrow();
    expect(() => validatePatternDef({ type: 'count', n: 25, freeCounts: false })).toThrow();
    expect(validatePatternDef({ type: 'count', n: 25, freeCounts: true })).toEqual({ type: 'count', n: 25, freeCounts: true });
  });

  it('la biblioteca precargada tiene las figuras pedidas', () => {
    const names = BUILTIN_PATTERNS.map((p) => p.name);
    for (const n of ['Primeros 3', 'Línea (cualquiera)', 'Columna (cualquiera)', 'Columna B', 'Columna O', 'Diagonal', 'X', 'L', 'T', 'Marco', 'Cartón lleno']) {
      expect(names).toContain(n);
    }
    BUILTIN_PATTERNS.forEach((p) => expect(() => validatePatternDef(p.def)).not.toThrow());
  });
});
