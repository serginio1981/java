/**
 * Lecturas de cartones externos con IA: esquema JSON exigido al modelo,
 * normalización, validación y comparación de la doble lectura. Puro: se
 * prueba con JSON de ejemplo sin llamar a la API.
 */
import { emptyGrid, isCenter, validateGrid, type Grid, type GridCheck } from '../bingo/grid';
import { LETTERS } from '../bingo/numbers';

export const MAX_CARDS_PER_PHOTO = 4;

const column = {
  type: 'array',
  description: 'Exactamente 5 valores, de arriba hacia abajo. null si la celda no se lee con certeza.',
  items: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
};

/** Esquema de salida estructurada. Rangos y largo se validan después (no se pueden expresar aquí). */
export const READING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cartones'],
  properties: {
    cartones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['serie', 'folio', 'columnas', 'completo', 'observaciones'],
        properties: {
          serie: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Serie impresa tal cual. null si no hay o no se lee.' },
          folio: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Folio impreso tal cual, con ceros a la izquierda. null si no se lee.' },
          columnas: {
            type: 'object',
            additionalProperties: false,
            required: ['B', 'I', 'N', 'G', 'O'],
            properties: { B: column, I: column, N: column, G: column, O: column },
          },
          completo: { type: 'boolean', description: 'false si el cartón está cortado, tapado, borroso o con reflejos.' },
          observaciones: { type: 'string', description: 'Problemas de lectura en una frase, o cadena vacía.' },
        },
      },
    },
  },
} as const;

export function readingPrompt(expected: number | null): string {
  return [
    'Transcribe cartones de bingo de 75 bolas a partir de una foto.',
    expected ? `La foto debería contener ${expected} cartón(es).` : `La foto contiene entre 1 y ${MAX_CARDS_PER_PHOTO} cartones.`,
    'Ordena los cartones de izquierda a derecha y de arriba hacia abajo.',
    'Cada cartón tiene 5 columnas con encabezado B, I, N, G, O y 5 filas.',
    'Rangos: B 1-15, I 16-30, N 31-45, G 46-60, O 61-75. La celda central (columna N, fila 3) es FREE: devuélvela como null.',
    'Entrega cada columna como un arreglo de 5 valores de arriba hacia abajo.',
    'Copia la serie y el folio tal como están impresos, sin corregirlos ni quitar ceros a la izquierda.',
    'Si un número o dato no se lee con certeza, pon null. No adivines: el operador revisará cada celda dudosa.',
    'Si un cartón está cortado por el borde, tapado o ilegible, márcalo completo=false y explica en observaciones.',
    'No inventes cartones que no estén en la imagen.',
  ].join('\n');
}

export interface RawCard {
  series: string;
  folio: string;
  grid: Grid;
  complete: boolean;
  notes: string;
  malformedColumns: string[];
}

const toText = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const toInt = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^\d{1,2}$/.test(v.trim())) return parseInt(v.trim(), 10);
  return null;
};

export class ReadingError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/**
 * Extrae el objeto JSON de la respuesta. Algunos modelos (sobre todo servidores
 * compatibles sin salida estructurada) lo envuelven en ```json … ``` o en texto.
 */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* sigue */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence?.[1]) { try { return JSON.parse(fence[1]); } catch { /* sigue */ } }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* sigue */ } }
  throw new ReadingError('json_invalido', 'La respuesta no es JSON válido');
}

/** Interpreta el texto JSON devuelto por el modelo. Lanza ReadingError si no sirve. */
export function parseReading(text: string): RawCard[] {
  const data = extractJson(text);
  const list = (data as { cartones?: unknown })?.cartones;
  if (!Array.isArray(list)) throw new ReadingError('json_invalido', 'La respuesta no trae la lista de cartones');
  return list.slice(0, MAX_CARDS_PER_PHOTO).map((c) => {
    const x = (c ?? {}) as Record<string, unknown>;
    const cols = (x['columnas'] ?? {}) as Record<string, unknown>;
    const grid = emptyGrid();
    const malformed: string[] = [];
    LETTERS.forEach((l, ci) => {
      const arr = cols[l];
      if (!Array.isArray(arr) || arr.length !== 5) malformed.push(l);
      for (let r = 0; r < 5; r++) {
        (grid[ci] as (number | null)[])[r] = isCenter(ci, r) ? null : toInt(Array.isArray(arr) ? arr[r] : null);
      }
    });
    return {
      series: toText(x['serie']),
      folio: toText(x['folio']),
      grid,
      complete: x['completo'] === true,
      notes: typeof x['observaciones'] === 'string' ? x['observaciones'] : '',
      malformedColumns: malformed,
    };
  });
}

export interface ReviewedCard {
  series: string;
  folio: string;
  grid: Grid;
  check: GridCheck;
  /** Celdas "col,fila" dudosas (inválidas o distintas entre lecturas). */
  doubtful: string[];
  seriesDoubtful: boolean;
  folioDoubtful: boolean;
  doubtfulCard: boolean;
  reasons: string[];
}

/** Combina una o dos lecturas en lo que revisa el operador. */
export function combineReadings(first: RawCard[], second: RawCard[] | null): ReviewedCard[] {
  const global: string[] = [];
  if (second && second.length !== first.length) {
    global.push(`Las dos lecturas no coinciden en la cantidad de cartones (${first.length} vs ${second.length})`);
  }
  return first.map((r, i) => {
    const check = validateGrid(r.grid);
    const doubtful = new Set(Object.keys(check.cells));
    const reasons = [...global];
    let seriesDoubtful = false;
    let folioDoubtful = !r.folio;
    if (!r.folio) reasons.push('Falta el folio');
    if (!r.complete) reasons.push('Cartón incompleto o poco legible en la foto');
    if (r.notes) reasons.push('IA: ' + r.notes);
    if (r.malformedColumns.length) reasons.push('Columnas mal formadas: ' + r.malformedColumns.join(', '));
    if (second) {
      const o = second[i];
      if (!o) {
        reasons.push('La segunda lectura no encontró este cartón');
        for (let c = 0; c < 5; c++) for (let f = 0; f < 5; f++) if (!isCenter(c, f)) doubtful.add(`${c},${f}`);
      } else {
        let diff = 0;
        for (let c = 0; c < 5; c++) {
          for (let f = 0; f < 5; f++) {
            if (isCenter(c, f)) continue;
            if (r.grid[c]?.[f] !== o.grid[c]?.[f]) { doubtful.add(`${c},${f}`); diff++; }
          }
        }
        if (diff) reasons.push(`${diff} celda(s) difieren entre las dos lecturas`);
        if (r.series !== o.series) { seriesDoubtful = true; reasons.push('La serie difiere entre lecturas'); }
        if (r.folio !== o.folio) { folioDoubtful = true; reasons.push('El folio difiere entre lecturas'); }
      }
    }
    check.errors.forEach((e) => reasons.push(e));
    return {
      series: r.series,
      folio: r.folio,
      grid: r.grid,
      check,
      doubtful: [...doubtful],
      seriesDoubtful,
      folioDoubtful,
      doubtfulCard: !check.ok || doubtful.size > 0 || seriesDoubtful || folioDoubtful || !r.complete,
      reasons,
    };
  });
}
