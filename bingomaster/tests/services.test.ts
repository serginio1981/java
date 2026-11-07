import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridKey, seededRng, validateGrid, type Grid } from '../src/shared/bingo/grid';
import { MASKS } from '../src/shared/patterns/patterns';
import { addCall, listCurrentCalls, undoLastCall } from '../src/main/calls/calls';
import {
  addExternalCard, cardIndex, findByFolio, findExact, generateOwnCards, getCard, listCards, ownCardsInRange, summary,
} from '../src/main/cards/cards';
import { openDatabase, type Db } from '../src/main/db/database';
import { createEvent, getActiveEvent, getEvent } from '../src/main/events/events';
import { addGame, allGamesFinished, finishGame, getCurrentGame, listGames, loadDefaultSequence, moveGame, nextGame, removeGame, setCurrentGame } from '../src/main/games/games';
import { DEFAULT_SEQUENCE } from '../src/main/events/events';
import { createPattern, ensureBuiltinPatterns, findPatternByName, listPatterns, removePattern } from '../src/main/patterns/patterns';
import { buildPrintHtml } from '../src/main/printing/html';
import { buildOperatorState } from '../src/main/state/state';
import { checkClaim, listWinners, registerWinner } from '../src/main/winners/winners';

const EXT_GRID: Grid = [
  [1, 2, 3, 4, 5],
  [16, 17, 18, 19, 20],
  [31, 32, null, 34, 35],
  [46, 47, 48, 49, 50],
  [61, 62, 63, 64, 65],
];
const IMG_DIR = mkdtempSync(join(tmpdir(), 'bm-img-'));

function setup(accumulate = true): { db: Db; ev: number } {
  const db = openDatabase(':memory:');
  ensureBuiltinPatterns(db);
  const e = createEvent(db, { name: 'Bingo Parroquia', date: '2026-11-07', seriesCode: 'nov26', accumulateCalls: accumulate });
  return { db, ev: e.id };
}
const ext = (db: Db, ev: number, series: string, folio: string, grid = EXT_GRID) =>
  addExternalCard(db, ev, { series, folio, grid, confirmed: true }, IMG_DIR);

describe('eventos', () => {
  it('crea con serie en mayúsculas, lo activa y carga la secuencia por defecto', () => {
    const { db, ev } = setup();
    expect(getEvent(db, ev)?.seriesCode).toBe('NOV26');
    expect(getActiveEvent(db)?.id).toBe(ev);
    expect(listGames(db, ev).map((g) => g.patternName)).toEqual(['Primeros 3', 'Línea (cualquiera)', 'X', 'Cartón lleno']);
    expect(getCurrentGame(db, ev)).toMatchObject({ index: 1, total: 4 });
  });

  it('rechaza serie inválida', () => {
    const db = openDatabase(':memory:');
    expect(() => createEvent(db, { name: 'x', date: '2026-11-07', seriesCode: 'NO VALE', accumulateCalls: true })).toThrow(/serie/);
  });
});

describe('cartones propios', () => {
  it('genera folios correlativos, layouts únicos y la numeración continúa', () => {
    const { db, ev } = setup();
    const a = generateOwnCards(db, ev, 300, seededRng(7));
    expect(a).toMatchObject({ created: 300, first: 'NOV26-0001', last: 'NOV26-0300' });
    const b = generateOwnCards(db, ev, 5, seededRng(8));
    expect(b.first).toBe('NOV26-0301');
    const cards = ownCardsInRange(db, ev);
    expect(cards).toHaveLength(305);
    expect(new Set(cards.map((c) => gridKey(c.grid))).size).toBe(305);
    expect(cards.every((c) => validateGrid(c.grid).ok && c.series === 'NOV26')).toBe(true);
    expect(summary(db, ev)).toEqual({ own: 305, external: 0, nextOwnFolio: 306 });
    expect(ownCardsInRange(db, ev, 10, 12).map((c) => c.folio)).toEqual(['0010', '0011', '0012']);
  });

  it('nunca repite un layout aunque el azar lo proponga', () => {
    const { db, ev } = setup();
    let calls = 0;
    // RNG que repite la misma secuencia para los dos primeros cartones.
    const base = seededRng(99);
    const seq: number[] = [];
    const rng = () => { calls++; if (seq.length < 75) { const v = base(); seq.push(v); return v; } return calls <= 150 ? seq[(calls - 1) % 75]! : base(); };
    generateOwnCards(db, ev, 2, rng);
    const [c1, c2] = ownCardsInRange(db, ev);
    expect(gridKey(c1!.grid)).not.toBe(gridKey(c2!.grid));
  });

  it('búsqueda por folio: con y sin ceros, con serie', () => {
    const { db, ev } = setup();
    generateOwnCards(db, ev, 20, seededRng(1));
    expect(findByFolio(db, ev, '7').map((c) => c.folio)).toEqual(['0007']);
    expect(findByFolio(db, ev, '0007')).toHaveLength(1);
    expect(findByFolio(db, ev, 'nov26-0007')).toHaveLength(1);
    expect(findByFolio(db, ev, '999')).toHaveLength(0);
  });
});

describe('cartones externos', () => {
  it('guarda serie y folio tal cual; mismo folio con otra serie es otro cartón', () => {
    const { db, ev } = setup();
    generateOwnCards(db, ev, 10, seededRng(2));
    const c = ext(db, ev, 'AR-7', '000007');
    expect(c).toMatchObject({ series: 'AR-7', folio: '000007', origin: 'external' });
    // folio 7 ahora existe en dos series: NOV26-0007 y AR-7 000007
    expect(findByFolio(db, ev, '7').map((x) => `${x.series} ${x.folio}`).sort()).toEqual(['AR-7 000007', 'NOV26 0007']);
    expect(findByFolio(db, ev, 'AR-7 7')).toHaveLength(1);
  });

  it('avisa si serie+folio ya existe (sin distinguir mayúsculas/espacios)', () => {
    const { db, ev } = setup();
    ext(db, ev, 'AR-7', '00451');
    expect(findExact(db, ev, 'ar-7', ' 00451 ')?.folio).toBe('00451');
    expect(() => ext(db, ev, 'ar-7', '00451')).toThrow(/Ya existe/);
    expect(() => ext(db, ev, 'AR-7', '0451')).not.toThrow(); // ceros distintos = otro folio impreso
  });

  it('rechaza sin confirmar, sin folio o con grilla inválida', () => {
    const { db, ev } = setup();
    expect(() => addExternalCard(db, ev, { series: 'A', folio: '1', grid: EXT_GRID, confirmed: false as unknown as true }, IMG_DIR)).toThrow(/confirm/);
    expect(() => ext(db, ev, 'A', '  ')).toThrow(/folio/);
    const bad = EXT_GRID.map((c) => [...c]);
    bad[0]![0] = 2;
    expect(() => ext(db, ev, 'A', '9', bad)).toThrow(/no es válido/);
  });

  it('guarda la foto de origen', () => {
    const { db, ev } = setup();
    const c = addExternalCard(db, ev, { series: 'A', folio: '1', grid: EXT_GRID, confirmed: true, image: { base64: Buffer.from('x').toString('base64'), mediaType: 'image/jpeg' } }, IMG_DIR);
    expect(getCard(db, c.id)?.hasImage).toBe(true);
  });
});

describe('juegos, validación y ganadores', () => {
  it('flujo completo: canta, valida por folio, registra, siguiente juego', () => {
    const { db, ev } = setup();
    const own = generateOwnCards(db, ev, 50, seededRng(3));
    expect(own.created).toBe(50);
    const card = ext(db, ev, 'AR-7', '1'); // juego 1 = Primeros 3
    addCall(db, ev, 70);
    addCall(db, ev, 1);
    addCall(db, ev, 16);
    expect(checkClaim(db, ev, card.id)).toMatchObject({ valid: false, complete: false, missingCount: 1 });
    addCall(db, ev, 31);
    const claim = checkClaim(db, ev, card.id);
    expect(claim).toMatchObject({ valid: true, completedAtSeq: 4, callsCount: 4 });
    const w = registerWinner(db, ev, card.id);
    expect(w).toMatchObject({ series: 'AR-7', folio: '1', callsCount: 4, gameName: 'Juego 1' });
    expect(() => registerWinner(db, ev, card.id)).toThrow(/ya está registrado/);
    expect(checkClaim(db, ev, card.id).alreadyWinner).toBe(true);
    nextGame(db, ev);
    expect(getCurrentGame(db, ev)?.pattern.name).toBe('Línea (cualquiera)');
    // Juego 2 (acumulado): la columna B del cartón se completa con el 5
    [2, 3, 4].forEach((n) => addCall(db, ev, n));
    addCall(db, ev, 5);
    expect(checkClaim(db, ev, card.id).valid).toBe(true);
    expect(listWinners(db, ev)).toHaveLength(1);
  });

  it('no se registra un bingo tardío (completó antes del último número)', () => {
    const { db, ev } = setup();
    const card = ext(db, ev, 'A', '1');
    [1, 16, 31, 70].forEach((n) => addCall(db, ev, n));
    expect(checkClaim(db, ev, card.id).valid).toBe(false);
    expect(() => registerWinner(db, ev, card.id)).toThrow(/No se puede registrar/);
  });

  it('varios ganadores en el mismo juego', () => {
    const { db, ev } = setup();
    const a = ext(db, ev, 'A', '1');
    const g2 = EXT_GRID.map((c) => [...c]);
    g2[4] = [66, 67, 68, 69, 70];
    const b = ext(db, ev, 'B', '1', g2);
    [1, 16, 31].forEach((n) => addCall(db, ev, n));
    registerWinner(db, ev, a.id);
    registerWinner(db, ev, b.id);
    expect(listWinners(db, ev).map((w) => w.series)).toEqual(['A', 'B']);
  });

  it('resumen del operador: completos y a 1 número', () => {
    const { db, ev } = setup();
    ext(db, ev, 'A', '1');
    [1, 16].forEach((n) => addCall(db, ev, n));
    const s = buildOperatorState(db, {
      overlay: null, settings: { model: '', doubleRead: false, apiKeyConfigured: false, encryptionAvailable: false, encryptionBackend: null, importFolder: '' },
      displays: [], publicWindow: { open: false, displayId: null, fullscreen: false }, dataPath: '', notice: null,
    });
    expect(s.near).toEqual({ complete: 0, oneAway: 1 });
    expect(cardIndex(db, ev)).toHaveLength(1);
  });

  it('modo reinicio: cada juego empieza sin números y no se deshace un número de un juego anterior', () => {
    const { db, ev } = setup(false);
    addCall(db, ev, 10);
    nextGame(db, ev);
    expect(listCurrentCalls(db, ev)).toHaveLength(0);
    expect(addCall(db, ev, 10).ok).toBe(true);
    expect(undoLastCall(db, ev).ok).toBe(true);
    expect(undoLastCall(db, ev)).toMatchObject({ ok: false, code: 'vacio' });
  });

  it('modo acumulado: no se deshace un número del juego anterior', () => {
    const { db, ev } = setup(true);
    addCall(db, ev, 10);
    nextGame(db, ev);
    expect(undoLastCall(db, ev)).toMatchObject({ ok: false, code: 'otro_juego' });
  });

  it('editar la secuencia: agregar, mover, quitar; no se quita un juego con actividad', () => {
    const { db, ev } = setup();
    const t = findPatternByName(db, 'T')!;
    addGame(db, ev, 'Especial', t.id);
    const games = listGames(db, ev);
    expect(games.map((g) => g.name)).toEqual(['Juego 1', 'Juego 2', 'Juego 3', 'Juego 4', 'Especial']);
    moveGame(db, ev, games[4]!.id, -1);
    expect(listGames(db, ev)[3]!.name).toBe('Especial');
    addCall(db, ev, 1);
    expect(() => removeGame(db, ev, games[0]!.id)).toThrow(/no se puede quitar/);
    removeGame(db, ev, games[4]!.id);
    expect(listGames(db, ev).map((g) => g.position)).toEqual([1, 2, 3, 4]);
  });
});

describe('figuras personalizadas', () => {
  it('se crean, se reutilizan entre eventos y no se borran si están en uso', () => {
    const { db, ev } = setup();
    const p = createPattern(db, 'Esquinas', { type: 'mask', mask: '1000100000000000000010001' });
    expect(listPatterns(db).some((x) => x.id === p.id && !x.isBuiltin)).toBe(true);
    const ev2 = createEvent(db, { name: 'Otro', date: '2026-12-01', seriesCode: 'DIC26', accumulateCalls: true });
    addGame(db, ev2.id, 'Esquinas', p.id);
    expect(() => removePattern(db, p.id)).toThrow(/se usa/);
    expect(() => removePattern(db, findPatternByName(db, 'X')!.id)).toThrow(/precargadas/);
    const g = createPattern(db, 'Mis líneas', { type: 'group', masks: [MASKS.rows[0]!, MASKS.rows[4]!] });
    removePattern(db, g.id);
    void ev;
  });
});

describe('impresión', () => {
  it('arma páginas según cartones por hoja, con serie y folio', () => {
    const { db, ev } = setup();
    generateOwnCards(db, ev, 5, seededRng(4));
    const cards = ownCardsInRange(db, ev);
    const html = buildPrintHtml(cards, 'Bingo <Parroquia>', { paper: 'A4', perPage: 4 });
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html.match(/class="slot empty"/g)).toHaveLength(3);
    expect(html).toContain('0005');
    expect(html).toContain('Bingo &lt;Parroquia&gt;');
    expect(buildPrintHtml(cards, 'x', { paper: 'Letter', perPage: 1 }).match(/class="page"/g)).toHaveLength(5);
  });
});

describe('recuperación de sesión completa', () => {
  it('juego actual, cartones y ganadores sobreviven al reinicio', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bm-')), 'r.db');
    let db = openDatabase(path);
    ensureBuiltinPatterns(db);
    const ev = createEvent(db, { name: 'R', date: '2026-11-07', seriesCode: 'R', accumulateCalls: true }).id;
    const card = ext(db, ev, 'A', '1');
    [1, 16, 31].forEach((n) => addCall(db, ev, n));
    registerWinner(db, ev, card.id);
    nextGame(db, ev);
    db.close();
    db = openDatabase(path);
    ensureBuiltinPatterns(db);
    expect(getCurrentGame(db, ev)?.index).toBe(2);
    expect(listWinners(db, ev)).toHaveLength(1);
    expect(listCards(db, ev, 0, 10).total).toBe(1);
    expect(listPatterns(db).filter((p) => p.isBuiltin)).toHaveLength(listPatterns(db).filter((p) => p.isBuiltin).length);
    db.close();
  });
});

describe('terminar juego (con o sin ganador)', () => {
  it('termina sin ganador y pasa al siguiente; el último cierra la secuencia', () => {
    const { db, ev } = setup();
    addCall(db, ev, 10);
    expect(finishGame(db, ev)?.name).toBe('Juego 2');
    expect(listGames(db, ev)[0]!.finished).toBe(true);
    finishGame(db, ev);
    finishGame(db, ev);
    expect(finishGame(db, ev)).toBeNull(); // terminó el último (sin ganadores)
    expect(getCurrentGame(db, ev)).toBeNull();
    expect(allGamesFinished(db, ev)).toBe(true);
    expect(addCall(db, ev, 11)).toMatchObject({ ok: false, code: 'terminado' });
    expect(() => finishGame(db, ev)).toThrow(/No hay un juego en curso/);
  });

  it('se puede reabrir un juego terminado', () => {
    const { db, ev } = setup();
    const first = listGames(db, ev)[0]!;
    finishGame(db, ev);
    setCurrentGame(db, ev, first.id);
    expect(getCurrentGame(db, ev)?.game.id).toBe(first.id);
    expect(listGames(db, ev)[0]!.finished).toBe(false);
    expect(allGamesFinished(db, ev)).toBe(false);
  });

  it('al terminar salta juegos ya terminados', () => {
    const { db, ev } = setup();
    const g = listGames(db, ev);
    setCurrentGame(db, ev, g[1]!.id);
    finishGame(db, ev); // termina el 2 → pasa al 3
    expect(getCurrentGame(db, ev)?.game.id).toBe(g[2]!.id);
    finishGame(db, ev); // 3 → 4
    finishGame(db, ev); // 4 → vuelve al 1 (pendiente)
    expect(getCurrentGame(db, ev)?.game.id).toBe(g[0]!.id);
  });

  it('evento sin juegos (versión anterior): carga la secuencia inicial', () => {
    const db = openDatabase(':memory:');
    ensureBuiltinPatterns(db);
    const ev = createEvent(db, { name: 'Viejo', date: '2026-11-07', seriesCode: 'V', accumulateCalls: true }, { defaultSequence: false }).id;
    expect(listGames(db, ev)).toHaveLength(0);
    expect(addCall(db, ev, 5).ok).toBe(true); // sin juegos se puede cantar igual
    loadDefaultSequence(db, ev, DEFAULT_SEQUENCE);
    expect(listGames(db, ev).map((x) => x.patternName)).toEqual(DEFAULT_SEQUENCE);
    expect(getCurrentGame(db, ev)?.index).toBe(1);
    expect(() => loadDefaultSequence(db, ev, DEFAULT_SEQUENCE)).toThrow(/ya tiene juegos/);
  });
});
