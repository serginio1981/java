import { describe, expect, it } from 'vitest';
import { positionIndex, type Grid } from '../src/shared/bingo/grid';
import { combineReadings, parseReading, READING_SCHEMA } from '../src/shared/import-ai/reading';
import { BUILTIN_PATTERNS, compile } from '../src/shared/patterns/patterns';
import { summarize, validateClaim } from '../src/shared/validation/validate';

const SAMPLE: Grid = [
  [1, 2, 3, 4, 5],
  [16, 17, 18, 19, 20],
  [31, 32, null, 34, 35],
  [46, 47, 48, 49, 50],
  [61, 62, 63, 64, 65],
];
const p = (name: string) => compile(BUILTIN_PATTERNS.find((x) => x.name === name)!.def);

describe('validar ¡bingo!', () => {
  it('válido si completa con el último número', () => {
    const r = validateClaim(SAMPLE, [70, 1, 2, 3, 4, 5], p('Columna B'));
    expect(r).toMatchObject({ valid: true, complete: true, completedAtSeq: 6, callsCount: 6 });
  });

  it('no válido si se completó antes del último número', () => {
    const r = validateClaim(SAMPLE, [1, 2, 3, 4, 5, 70], p('Columna B'));
    expect(r).toMatchObject({ valid: false, complete: true, completedAtSeq: 5 });
    expect(r.reason).toMatch(/no con el último/);
  });

  it('no válido si falta, e informa cuántos', () => {
    const r = validateClaim(SAMPLE, [1, 2, 3], p('Columna B'));
    expect(r).toMatchObject({ valid: false, complete: false, missingCount: 2 });
  });

  it('grupo: resalta la máscara cumplida', () => {
    const r = validateClaim(SAMPLE, [61, 62, 63, 64, 65], p('Línea (cualquiera)'));
    expect(r.valid).toBe(true);
    expect(r.target).not.toBeNull();
  });

  it('por cantidad', () => {
    expect(validateClaim(SAMPLE, [70, 1, 16, 31], p('Primeros 3')).valid).toBe(true);
    expect(validateClaim(SAMPLE, [1, 16, 31, 70], p('Primeros 3')).valid).toBe(false);
  });

  it('resumen del operador: completos y a 1 número', () => {
    const cards = [
      { id: 1, pos: positionIndex(SAMPLE) },
      { id: 2, pos: positionIndex(SAMPLE.map((c, i) => (i === 0 ? [6, 7, 8, 9, 10] : c))) },
    ];
    expect(summarize(cards, [1, 2, 3, 4, 5], p('Columna B'))).toEqual({ complete: 1, oneAway: 0 });
    expect(summarize(cards, [1, 2, 3, 4, 6, 7, 8, 9], p('Columna B'))).toEqual({ complete: 0, oneAway: 2 });
  });
});

const reading = (folio: string | null, cols: Record<string, (number | null)[]>, extra = {}) => ({
  serie: 'AR-7', folio, completo: true, observaciones: '',
  columnas: { B: [1, 2, 3, 4, 5], I: [16, 17, 18, 19, 20], N: [31, 32, null, 34, 35], G: [46, 47, 48, 49, 50], O: [61, 62, 63, 64, 65], ...cols },
  ...extra,
});

describe('lecturas de IA (sin llamar a la API)', () => {
  it('el esquema exige additionalProperties:false en todos los objetos', () => {
    const walk = (s: unknown): void => {
      if (s && typeof s === 'object') {
        const o = s as Record<string, unknown>;
        if (o['type'] === 'object') expect(o['additionalProperties']).toBe(false);
        Object.values(o).forEach(walk);
      }
    };
    walk(READING_SCHEMA);
  });

  it('lectura correcta: no dudosa y conserva ceros del folio', () => {
    const r = combineReadings(parseReading(JSON.stringify({ cartones: [reading('004512', {})] })), null);
    expect(r[0]).toMatchObject({ folio: '004512', doubtfulCard: false, doubtful: [] });
  });

  it('fuera de rango, repetido, ilegible y sin folio => dudoso', () => {
    const r = combineReadings(parseReading(JSON.stringify({ cartones: [reading(null, { B: [1, 1, null, 4, 99] })] })), null)[0]!;
    expect(r.doubtfulCard).toBe(true);
    expect(r.folioDoubtful).toBe(true);
    expect(r.doubtful.sort()).toEqual(['0,0', '0,1', '0,2', '0,4']);
  });

  it('centro con número se normaliza a FREE; textos numéricos se aceptan', () => {
    const [c] = parseReading(JSON.stringify({ cartones: [reading('1', { N: ['31', 32, 33, 34, 35] as never })] }));
    expect(c!.grid[2]).toEqual([31, 32, null, 34, 35]);
  });

  it('doble lectura: celdas y folio distintos quedan dudosos', () => {
    const a = parseReading(JSON.stringify({ cartones: [reading('0001', {})] }));
    const b = parseReading(JSON.stringify({ cartones: [reading('0007', { G: [46, 47, 48, 49, 51] })] }));
    const [r] = combineReadings(a, b);
    expect(r).toMatchObject({ doubtful: ['3,4'], folioDoubtful: true, doubtfulCard: true });
  });

  it('doble lectura con distinta cantidad de cartones', () => {
    const a = parseReading(JSON.stringify({ cartones: [reading('1', {}), reading('2', {})] }));
    const b = parseReading(JSON.stringify({ cartones: [reading('1', {})] }));
    const r = combineReadings(a, b);
    expect(r[1]!.doubtful).toHaveLength(24);
    expect(r[0]!.reasons[0]).toMatch(/cantidad/);
  });

  it('JSON inválido, sin lista y máximo 4 cartones', () => {
    expect(() => parseReading('hola')).toThrow(/JSON/);
    expect(() => parseReading('{}')).toThrow(/lista/);
    expect(parseReading(JSON.stringify({ cartones: [1, 2, 3, 4, 5].map((i) => reading(String(i), {})) }))).toHaveLength(4);
  });
});
