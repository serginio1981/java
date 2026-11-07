import { describe, expect, it } from 'vitest';
import { isValidNumber, label, letterFor, numbersByLetter, parseInput, RANGES } from '../src/shared/bingo/numbers';

describe('letras y rangos', () => {
  it('deriva la letra en los bordes de cada rango', () => {
    expect([1, 15, 16, 30, 31, 45, 46, 60, 61, 75].map(letterFor).join('')).toBe('BBIINNGGOO');
  });

  it('cada letra tiene 15 números dentro de su rango', () => {
    const by = numbersByLetter();
    for (const [l, [min, max]] of Object.entries(RANGES)) {
      const ns = by[l as keyof typeof by];
      expect(ns).toHaveLength(15);
      expect(ns.every((n) => n >= min && n <= max)).toBe(true);
    }
  });

  it('valida el rango 1-75', () => {
    expect([0, 76, -1, 1.5, NaN].some(isValidNumber)).toBe(false);
    expect(isValidNumber(1) && isValidNumber(75)).toBe(true);
    expect(() => letterFor(0)).toThrow(RangeError);
    expect(label(42)).toBe('N-42');
  });
});

describe('parseInput (lo que digita el operador)', () => {
  it('acepta número solo o con letra correcta', () => {
    expect(parseInput(' 12 ')).toEqual({ ok: true, number: 12 });
    expect(parseInput('b12')).toEqual({ ok: true, number: 12 });
    expect(parseInput('O-75')).toEqual({ ok: true, number: 75 });
  });

  it('rechaza vacío, fuera de rango, letra equivocada y texto', () => {
    expect(parseInput('').ok).toBe(false);
    expect(parseInput('0')).toMatchObject({ ok: false, error: expect.stringContaining('fuera de rango') });
    expect(parseInput('76').ok).toBe(false);
    expect(parseInput('G12')).toMatchObject({ ok: false, error: expect.stringContaining('B-12') });
    expect(parseInput('1 2 x').ok).toBe(false);
  });
});
