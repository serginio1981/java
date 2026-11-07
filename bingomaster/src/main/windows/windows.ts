import { BrowserWindow, screen, type Display } from 'electron';
import { join } from 'node:path';
import type { DisplayInfo, PublicWindowInfo } from '../../shared/ipc/contract';

const PRELOAD = join(__dirname, '../preload/index.js');

function loadPage(win: BrowserWindow, page: 'operator' | 'public'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html`);
  else void win.loadFile(join(__dirname, `../renderer/${page}.html`));
}

const webPreferences = {
  preload: PRELOAD,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

export function listDisplays(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${d.id === primaryId ? 'Principal' : 'Pantalla ' + (i + 1)} (${d.size.width}×${d.size.height})`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primaryId,
  }));
}

/** Primera pantalla que no sea la principal (el proyector), si existe. */
export function externalDisplay(): Display | null {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().find((d) => d.id !== primaryId) ?? null;
}

export function createOperatorWindow(): BrowserWindow {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: Math.min(1366, area.width),
    height: Math.min(800, area.height),
    minWidth: 1024,
    minHeight: 640,
    title: 'BingoMaster — Operador',
    show: false,
    webPreferences,
  });
  win.once('ready-to-show', () => win.show());
  loadPage(win, 'operator');
  return win;
}

export class PublicWindowManager {
  private win: BrowserWindow | null = null;
  private displayId: number | null = null;

  constructor(private readonly onChange: () => void) {}

  info(): PublicWindowInfo {
    const open = !!this.win && !this.win.isDestroyed();
    return {
      open,
      displayId: open ? this.displayId : null,
      fullscreen: open ? (this.win as BrowserWindow).isFullScreen() : false,
    };
  }

  window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  /**
   * Abre (o mueve) la ventana pública. Sin displayId: la externa si existe.
   * En una pantalla externa va a pantalla completa; en la principal abre en
   * ventana para no tapar el panel del operador.
   */
  open(displayId: number | null): void {
    const displays = screen.getAllDisplays();
    const target =
      (displayId !== null ? displays.find((d) => d.id === displayId) : null) ??
      externalDisplay() ??
      screen.getPrimaryDisplay();
    const isExternal = target.id !== screen.getPrimaryDisplay().id;
    this.displayId = target.id;

    let win = this.window();
    if (!win) {
      win = new BrowserWindow({
        title: 'BingoMaster — Pantalla pública',
        backgroundColor: '#05070d',
        autoHideMenuBar: true,
        show: false,
        webPreferences,
      });
      win.on('closed', () => {
        this.win = null;
        this.displayId = null;
        this.onChange();
      });
      win.on('enter-full-screen', () => this.onChange());
      win.on('leave-full-screen', () => this.onChange());
      win.once('ready-to-show', () => win?.show());
      loadPage(win, 'public');
      this.win = win;
    }
    if (win.isFullScreen()) win.setFullScreen(false);
    const { x, y, width, height } = target.workArea;
    if (isExternal) {
      win.setBounds(target.bounds);
      win.setFullScreen(true);
    } else {
      const w = Math.min(1280, width);
      const h = Math.round((w * 9) / 16);
      win.setBounds({ x: x + Math.round((width - w) / 2), y: y + Math.round((height - h) / 2), width: w, height: h });
    }
    this.onChange();
  }

  close(): void {
    this.window()?.close();
  }

  toggleFullscreen(): void {
    const w = this.window();
    if (w) w.setFullScreen(!w.isFullScreen());
  }
}
