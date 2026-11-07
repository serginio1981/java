import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, screen, session } from 'electron';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, type FSWatcher } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { CommandName, Commands, OperatorState, Overlay, Result } from '../shared/ipc/contract';
import { FOLDER_CHANNEL, STATE_CHANNEL } from '../shared/ipc/contract';
import { addCall, undoLastCall } from './calls/calls';
import {
  addExternalCard, cardImagePath, findByFolio, findExact, invalidateIndex, listCards, ownCardsInRange, generateOwnCards,
} from './cards/cards';
import { backupTo, getMeta, inspectBackup, openDatabase, setMeta, type Db } from './db/database';
import { appError } from './errors';
import { activateEvent, createEvent, DEFAULT_SEQUENCE, ensureActiveEvent, getActiveEvent, updateEvent } from './events/events';
import { addGame, finishGame, loadDefaultSequence, moveGame, removeGame, setCurrentGame, updateGame } from './games/games';
import { readCards } from './import-ai/vision';
import { createPattern, ensureBuiltinPatterns, removePattern, updatePattern } from './patterns/patterns';
import { renderPdf } from './printing/pdf';
import { Settings } from './settings/settings';
import { runSmokeTest } from './smoke';
import { buildOperatorState, toPublic } from './state/state';
import { checkClaim, registerWinner, setWinnerNote } from './winners/winners';
import { buildMenu } from './windows/menu';
import { createOperatorWindow, listDisplays, openManual, PublicWindowManager } from './windows/windows';

if (process.argv.includes('--smoke-test')) {
  runSmokeTest();
} else if (!app.requestSingleInstanceLock()) {
  // Una sola instancia: dos procesos sobre la misma BD serían un riesgo.
  app.quit();
} else {
  main();
}

const IMAGE_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function main(): void {
  let db: Db;
  let settings: Settings;
  let operator: BrowserWindow | null = null;
  let overlay: Overlay | null = null;
  let notice: string | null = null;
  let folderWatcher: FSWatcher | null = null;
  const dataDir = app.getPath('userData');
  const dbPath = join(dataDir, 'bingomaster.db');
  const imagesDir = join(dataDir, 'imagenes');

  const publicWin = new PublicWindowManager(() => broadcast());

  function state(): OperatorState {
    return buildOperatorState(db, {
      overlay, settings: settings.view(), displays: listDisplays(), publicWindow: publicWin.info(), dataPath: dbPath, notice,
    });
  }

  function broadcast(): void {
    const s = state();
    if (operator && !operator.isDestroyed()) operator.webContents.send(STATE_CHANNEL, s);
    publicWin.window()?.webContents.send(STATE_CHANNEL, toPublic(s));
  }

  function eventId(): number {
    const ev = getActiveEvent(db);
    if (!ev) throw appError('evento', 'No hay un evento activo');
    return ev.id;
  }

  const isOwnFrame = (url: string): boolean => {
    const dev = process.env['ELECTRON_RENDERER_URL'];
    return url.startsWith('file:') || (!!dev && url.startsWith(dev));
  };

  type Handler<K extends CommandName> = (...args: Commands[K]['args']) => Commands[K]['result'] | Promise<Commands[K]['result']>;
  /** Registra un comando: solo desde la ventana del operador, errores legibles y difusión del estado. */
  function handle<K extends CommandName>(channel: K, fn: Handler<K>, opts: { mutates?: boolean } = {}): void {
    ipcMain.handle(channel, async (e, ...args) => {
      if (!isOwnFrame(e.senderFrame?.url ?? '') || e.sender !== operator?.webContents) {
        return { ok: false, code: 'origen', error: 'Comando no permitido desde esta ventana' } satisfies Result;
      }
      try {
        const out = await fn(...(args as Commands[K]['args']));
        if (opts.mutates !== false) broadcast();
        return out;
      } catch (err) {
        const ex = err as Error & { code?: string };
        if (!ex.code) console.error(`[${channel}]`, err);
        // Errores de restricciones de SQLite → mensaje legible
        const msg = /UNIQUE constraint/.test(ex.message) ? 'Ya existe un registro igual' : ex.message || 'Error interno';
        return { ok: false, code: ex.code ?? 'interno', error: msg } satisfies Result;
      }
    });
  }
  const ok = { ok: true } as const;

  function watchFolder(): void {
    folderWatcher?.close();
    folderWatcher = null;
    const dir = settings.importFolder();
    if (!dir || !existsSync(dir)) return;
    try {
      let t: NodeJS.Timeout | undefined;
      folderWatcher = watch(dir, () => {
        clearTimeout(t);
        t = setTimeout(() => operator?.webContents.send(FOLDER_CHANNEL), 800);
      });
      folderWatcher.on('error', () => undefined);
    } catch { folderWatcher = null; }
  }

  function importedKeys(): Set<string> {
    try { return new Set(JSON.parse(getMeta(db, 'import.imported') ?? '[]') as string[]); } catch { return new Set(); }
  }

  function registerIpc(): void {
    // Estado: la pública recibe solo la proyección pública.
    ipcMain.handle('state:get', (e) => {
      const s = state();
      return e.sender === publicWin.window()?.webContents ? toPublic(s) : s;
    });

    handle('calls:add', (n) => { notice = null; return addCall(db, eventId(), n); });
    handle('calls:undo', () => undoLastCall(db, eventId()));

    handle('events:create', (input) => {
      const event = createEvent(db, input);
      overlay = null;
      return { ok: true, event };
    });
    handle('events:update', (id, u) => { updateEvent(db, id, u); return ok; });
    handle('events:activate', (id) => { activateEvent(db, id); overlay = null; return ok; });

    handle('games:add', (g) => { addGame(db, eventId(), g.name, g.patternId); return ok; });
    handle('games:update', (id, g) => { updateGame(db, eventId(), id, g.name, g.patternId); return ok; });
    handle('games:remove', (id) => { removeGame(db, eventId(), id); return ok; });
    handle('games:move', (id, dir) => { moveGame(db, eventId(), id, dir); return ok; });
    handle('games:next', () => { const next = finishGame(db, eventId()); overlay = null; return { ok: true, next }; });
    handle('games:loadDefault', () => { loadDefaultSequence(db, eventId(), DEFAULT_SEQUENCE); return ok; });
    handle('games:setCurrent', (id) => { setCurrentGame(db, eventId(), id); overlay = null; return ok; });

    handle('patterns:create', (p) => ({ ok: true, pattern: createPattern(db, p.name, p.def) }));
    handle('patterns:update', (id, p) => { updatePattern(db, id, p.name, p.def); return ok; });
    handle('patterns:remove', (id) => { removePattern(db, id); return ok; });

    handle('cards:generate', (n) => ({ ok: true, ...generateOwnCards(db, eventId(), n) }));
    handle('cards:list', (q) => listCards(db, eventId(), q.offset, q.limit, q.search), { mutates: false });
    handle('cards:find', (folio) => findByFolio(db, eventId(), folio), { mutates: false });
    handle('cards:exists', (series, folio) => findExact(db, eventId(), series, folio), { mutates: false });
    handle('cards:addExternal', (input) => ({ ok: true, card: addExternalCard(db, eventId(), input, imagesDir) }));
    handle('cards:image', (id) => {
      const p = cardImagePath(db, id);
      if (!p || !existsSync(p)) throw appError('imagen', 'El cartón no tiene foto guardada');
      const mime = IMAGE_EXT[extname(p).toLowerCase()] ?? 'image/jpeg';
      return { ok: true, dataUrl: `data:${mime};base64,${readFileSync(p).toString('base64')}` };
    }, { mutates: false });
    handle('cards:exportPdf', async (opts) => {
      const ev = getActiveEvent(db);
      if (!ev) throw appError('evento', 'No hay un evento activo');
      if (![1, 2, 4].includes(opts.perPage) || !['Letter', 'A4'].includes(opts.paper)) throw appError('pdf', 'Opciones de impresión inválidas');
      const cards = ownCardsInRange(db, ev.id, opts.from, opts.to);
      if (!cards.length) throw appError('pdf', 'No hay cartones propios en ese rango de folios');
      const range = `${cards[0]?.folio}-${cards[cards.length - 1]?.folio}`;
      const res = await dialog.showSaveDialog(operator as BrowserWindow, {
        title: 'Guardar cartones en PDF',
        defaultPath: `${ev.seriesCode}_${range}_${opts.paper}_${opts.perPage}xhoja.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) throw appError('cancelado', 'Exportación cancelada');
      await renderPdf(cards, ev.name, opts, res.filePath);
      return { ok: true, path: res.filePath, count: cards.length };
    }, { mutates: false });

    handle('claims:check', (cardId) => ({ ok: true, claim: checkClaim(db, eventId(), cardId) }), { mutates: false });
    handle('winners:register', (cardId) => ({ ok: true, winner: registerWinner(db, eventId(), cardId) }));
    handle('winners:note', (id, note) => { setWinnerNote(db, eventId(), id, note); return ok; });
    handle('overlay:show', (o) => { overlay = { series: String(o.series), folio: String(o.folio), gameName: String(o.gameName) }; return ok; });
    handle('overlay:hide', () => { overlay = null; return ok; });

    handle('data:backup', async () => {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const r = await dialog.showSaveDialog(operator as BrowserWindow, {
        title: 'Respaldar base de datos',
        defaultPath: join(app.getPath('documents'), `BingoMaster-respaldo-${stamp}.db`),
        filters: [{ name: 'Respaldo de BingoMaster', extensions: ['db'] }],
      });
      if (r.canceled || !r.filePath) throw appError('cancelado', 'Sin cambios');
      if (r.filePath === dbPath) throw appError('respaldo', 'Elija otro archivo distinto a la base de datos en uso');
      if (existsSync(r.filePath)) rmSync(r.filePath);
      backupTo(db, r.filePath);
      return { ok: true, path: r.filePath };
    }, { mutates: false });
    handle('data:restore', async () => {
      const r = await dialog.showOpenDialog(operator as BrowserWindow, {
        title: 'Restaurar respaldo', properties: ['openFile'], filters: [{ name: 'Respaldo de BingoMaster', extensions: ['db'] }],
      });
      const src = r.filePaths[0];
      if (r.canceled || !src) throw appError('cancelado', 'Sin cambios');
      const info = inspectBackup(src);
      if (!info.ok) throw appError('respaldo', info.error);
      const c = await dialog.showMessageBox(operator as BrowserWindow, {
        type: 'warning', buttons: ['Restaurar', 'Cancelar'], defaultId: 1, cancelId: 1, title: 'Restaurar respaldo',
        message: `¿Reemplazar los datos actuales por el respaldo?`,
        detail: `El respaldo tiene ${info.events} evento(s) y ${info.cards} cartón(es). Los datos actuales se perderán; antes se guarda una copia automática junto a la base de datos.`,
      });
      if (c.response !== 0) throw appError('cancelado', 'Sin cambios');
      // Copia de seguridad automática de lo actual antes de reemplazar.
      const safety = join(dataDir, `antes-de-restaurar-${Date.now()}.db`);
      backupTo(db, safety);
      db.close();
      for (const ext of ['-wal', '-shm']) rmSync(dbPath + ext, { force: true });
      copyFileSync(src, dbPath);
      db = openDatabase(dbPath);
      ensureBuiltinPatterns(db);
      ensureActiveEvent(db, new Date().toISOString().slice(0, 10));
      settings = new Settings(db, safeStorage);
      invalidateIndex();
      overlay = null;
      notice = `Respaldo restaurado (${info.events} evento(s), ${info.cards} cartón(es)). Copia de los datos anteriores: ${safety}`;
      return { ok: true, events: info.events, cards: info.cards };
    });
    handle('help:openManual', (section) => { openManual(section && /^[a-z-]{1,30}$/.test(section) ? section : undefined); return ok; }, { mutates: false });
    handle('public:open', (displayId) => { publicWin.open(displayId); return ok; });
    handle('public:close', () => { publicWin.close(); return ok; });
    handle('public:toggleFullscreen', () => { publicWin.toggleFullscreen(); return ok; });

    handle('settings:update', (u) => { settings.update(u); return ok; });
    handle('settings:setApiKey', (k) => { settings.setApiKey(k); return ok; });
    handle('settings:clearApiKey', () => { settings.clearApiKey(); return ok; });

    handle('import:chooseFolder', async () => {
      const r = await dialog.showOpenDialog(operator as BrowserWindow, { title: 'Carpeta compartida con el celular', properties: ['openDirectory'] });
      if (r.canceled || !r.filePaths[0]) throw appError('cancelado', 'Sin cambios');
      settings.setImportFolder(r.filePaths[0]);
      watchFolder();
      return ok;
    });
    handle('import:clearFolder', () => { settings.setImportFolder(null); watchFolder(); return ok; });
    handle('import:listFolder', () => {
      const folder = settings.importFolder();
      if (!folder) return { ok: true, folder: '', files: [] };
      if (!existsSync(folder)) throw appError('carpeta', 'La carpeta compartida no está disponible: ' + folder);
      const done = importedKeys();
      const files = readdirSync(folder, { withFileTypes: true })
        .filter((d) => d.isFile() && IMAGE_EXT[extname(d.name).toLowerCase()])
        .map((d) => {
          const st = statSync(join(folder, d.name));
          const key = `${d.name}|${st.size}|${Math.round(st.mtimeMs)}`;
          return { name: d.name, size: st.size, modified: st.mtimeMs, key, imported: done.has(key) };
        })
        .sort((a, b) => b.modified - a.modified);
      return { ok: true, folder, files };
    }, { mutates: false });
    handle('import:readFolderFile', (name) => {
      const folder = settings.importFolder();
      const safe = basename(String(name));
      if (!folder || safe !== name || safe.startsWith('.')) throw appError('archivo', 'Archivo no válido');
      const mediaType = IMAGE_EXT[extname(safe).toLowerCase()];
      if (!mediaType) throw appError('archivo', 'Formato no soportado (JPG, PNG o WEBP)');
      const path = join(folder, safe);
      const st = statSync(path);
      if (st.size > MAX_IMAGE_BYTES) throw appError('archivo', 'Imagen demasiado grande');
      return { ok: true, base64: readFileSync(path).toString('base64'), mediaType, key: `${safe}|${st.size}|${Math.round(st.mtimeMs)}` };
    }, { mutates: false });
    handle('import:markImported', (key) => {
      const s = importedKeys();
      s.add(String(key));
      setMeta(db, 'import.imported', JSON.stringify([...s].slice(-5000)));
      return ok;
    }, { mutates: false });
    handle('import:read', (p) => readCards({
      apiKey: settings.apiKey(), model: settings.model(), doubleRead: settings.doubleRead(),
      base64: p.base64, mediaType: p.mediaType, expected: p.expected,
    }), { mutates: false });
  }

  app.whenReady().then(() => {
    try {
      mkdirSync(imagesDir, { recursive: true });
      const existed = existsSync(dbPath);
      db = openDatabase(dbPath);
      ensureBuiltinPatterns(db);
      const ev = ensureActiveEvent(db, new Date().toISOString().slice(0, 10));
      settings = new Settings(db, safeStorage);
      if (existed) {
        const n = (db.prepare('SELECT COUNT(*) AS n FROM calls WHERE event_id = ?').get(ev.id) as { n: number }).n;
        if (n > 0) notice = `Sesión recuperada: "${ev.name}" con ${n} número(s) cantado(s).`;
      }
    } catch (err) {
      dialog.showErrorBox('BingoMaster', `No se pudo abrir la base de datos:\n${dbPath}\n\n${(err as Error).message}`);
      app.exit(1);
      return;
    }
    invalidateIndex();

    // Ventanas 100% offline: la única salida a internet es la API de Claude,
    // y se llama desde este proceso (Node), no desde las ventanas.
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      const dev = process.env['ELECTRON_RENDERER_URL'];
      const allowed = /^(file|data|blob|devtools):/.test(d.url) || (!!dev && d.url.startsWith(dev)) || (!!dev && /^wss?:\/\/localhost/.test(d.url));
      cb({ cancel: !allowed });
    });
    // Permisos: solo la cámara (video) y solo para la ventana del operador (importación de cartones).
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
      const media = details as { mediaTypes?: string[] };
      const videoOnly = perm === 'media' && Array.isArray(media.mediaTypes) && media.mediaTypes.length > 0 && media.mediaTypes.every((t) => t === 'video');
      cb(videoOnly && wc === operator?.webContents);
    });
    session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'media' && wc === operator?.webContents);

    registerIpc();
    Menu.setApplicationMenu(buildMenu({
      operator: () => operator,
      openPublic: () => publicWin.open(null),
      closePublic: () => publicWin.close(),
      togglePublicFullscreen: () => publicWin.toggleFullscreen(),
    }));
    operator = createOperatorWindow();
    operator.on('closed', () => {
      operator = null;
      publicWin.close();
    });
    watchFolder();
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
      screen.on(ev as 'display-added', () => broadcast());
    }
  });

  app.on('second-instance', () => {
    if (operator) {
      if (operator.isMinimized()) operator.restore();
      operator.focus();
    }
  });

  app.on('window-all-closed', () => {
    folderWatcher?.close();
    try { db?.close(); } catch { /* ya cerrada */ }
    app.quit();
  });
}

