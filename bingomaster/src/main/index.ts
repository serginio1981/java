import { app, BrowserWindow, dialog, ipcMain, screen, session } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { CommandName, Commands, OperatorState, Result } from '../shared/ipc/contract';
import { STATE_CHANNEL } from '../shared/ipc/contract';
import { addCall, undoLastCall } from './calls/calls';
import { openDatabase, type Db } from './db/database';
import { ensureActiveEvent, getActiveEvent } from './events/events';
import { buildOperatorState, toPublic } from './state/state';
import { createOperatorWindow, listDisplays, PublicWindowManager } from './windows/windows';
import { runSmokeTest } from './smoke';

if (process.argv.includes('--smoke-test')) {
  runSmokeTest();
} else {
  // Una sola instancia: dos procesos sobre la misma BD serían un riesgo.
  if (!app.requestSingleInstanceLock()) app.quit();
  else main();
}

function main(): void {
  let db: Db;
  let operator: BrowserWindow | null = null;
  const dataDir = app.getPath('userData');
  const dbPath = join(dataDir, 'bingomaster.db');

  const publicWin = new PublicWindowManager(() => broadcast());

  function state(): OperatorState {
    return buildOperatorState(db, { displays: listDisplays(), publicWindow: publicWin.info(), dataPath: dbPath });
  }

  function broadcast(): void {
    const s = state();
    if (operator && !operator.isDestroyed()) operator.webContents.send(STATE_CHANNEL, s);
    publicWin.window()?.webContents.send(STATE_CHANNEL, toPublic(s));
  }

  function activeEventId(): number {
    const ev = getActiveEvent(db);
    if (!ev) throw Object.assign(new Error('No hay un evento activo'), { code: 'evento' });
    return ev.id;
  }

  type Handler<K extends CommandName> = (...args: Commands[K]['args']) => Commands[K]['result'];
  function handle<K extends CommandName>(channel: K, fn: Handler<K>, opts: { mutates: boolean } = { mutates: true }): void {
    ipcMain.handle(channel, (e, ...args) => {
      // Solo se aceptan comandos de nuestras propias ventanas.
      const url = e.senderFrame?.url ?? '';
      if (!url.startsWith('file:') && !(process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))) {
        return { ok: false, code: 'origen', error: 'Origen no permitido' } satisfies Result;
      }
      try {
        const out = fn(...(args as Commands[K]['args']));
        if (opts.mutates) broadcast();
        return out;
      } catch (err) {
        const e2 = err as Error & { code?: string };
        console.error(`[${channel}]`, err);
        return { ok: false, code: e2.code ?? 'interno', error: e2.message || 'Error interno' } satisfies Result;
      }
    });
  }

  function registerIpc(): void {
    // La ventana pública recibe solo la proyección pública, nunca datos del operador.
    ipcMain.handle('state:get', (e) => {
      const s = state();
      return e.sender === publicWin.window()?.webContents ? toPublic(s) : s;
    });
    handle('calls:add', (n) => addCall(db, activeEventId(), n));
    handle('calls:undo', () => undoLastCall(db, activeEventId()));
    handle('public:open', (displayId) => { publicWin.open(displayId); return { ok: true }; });
    handle('public:close', () => { publicWin.close(); return { ok: true }; });
    handle('public:toggleFullscreen', () => { publicWin.toggleFullscreen(); return { ok: true }; });
  }

  app.whenReady().then(() => {
    try {
      mkdirSync(dataDir, { recursive: true });
      db = openDatabase(dbPath);
      ensureActiveEvent(db, new Date().toISOString().slice(0, 10));
    } catch (err) {
      dialog.showErrorBox('BingoMaster', `No se pudo abrir la base de datos:\n${dbPath}\n\n${(err as Error).message}`);
      app.exit(1);
      return;
    }

    // 100% offline: ninguna ventana puede salir a la red.
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      const dev = process.env['ELECTRON_RENDERER_URL'];
      const allowed = /^(file|data|blob|devtools):/.test(d.url) || (!!dev && d.url.startsWith(dev)) ||
        (!!dev && /^wss?:\/\/localhost/.test(d.url));
      cb({ cancel: !allowed });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    registerIpc();
    operator = createOperatorWindow();
    operator.on('closed', () => {
      operator = null;
      publicWin.close();
    });
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
    try { db?.close(); } catch { /* ya cerrada */ }
    app.quit();
  });
}
