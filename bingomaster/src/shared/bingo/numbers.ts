/** Reglas del bingo americano de 75 bolas. Puro, sin dependencias. */

export const LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
export type Letter = (typeof LETTERS)[number];

export const MIN_NUMBER = 1;
export const MAX_NUMBER = 75;

export const RANGES: Record<Letter, readonly [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

export function isValidNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_NUMBER && n <= MAX_NUMBER;
}

/** Letra derivada del rango. Lanza si el número no es válido. */
export function letterFor(n: number): Letter {
  if (!isValidNumber(n)) throw new RangeError(`Número fuera de rango: ${n}`);
  return LETTERS[Math.floor((n - 1) / 15)] as Letter;
}

/** "B-12" */
export function label(n: number): string {
  return `${letterFor(n)}-${n}`;
}

/** Números 1..75 agrupados por letra, en orden. */
export function numbersByLetter(): Record<Letter, number[]> {
  const out = { B: [], I: [], N: [], G: [], O: [] } as Record<Letter, number[]>;
  for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) out[letterFor(n)].push(n);
  return out;
}

/**
 * Interpreta lo que digita el operador. Acepta "12", " 12 ", "B12", "b-12".
 * Si viene con letra, debe coincidir con el rango.
 */
export type ParseResult = { ok: true; number: number } | { ok: false; error: string };

export function parseInput(raw: string): ParseResult {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (s === '') return { ok: false, error: 'Escriba un número' };
  const m = /^([BINGO])?-?(\d{1,3})$/.exec(s);
  if (!m) return { ok: false, error: `"${raw.trim()}" no es un número válido` };
  const n = parseInt(m[2] as string, 10);
  if (!isValidNumber(n)) return { ok: false, error: `${n} está fuera de rango (1 a 75)` };
  const letter = m[1] as Letter | undefined;
  if (letter && letterFor(n) !== letter) {
    return { ok: false, error: `${n} no es de la ${letter}: es ${label(n)}` };
  }
  return { ok: true, number: n };
}
