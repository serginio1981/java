import { app, dialog, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { DONATE_URL, PRIVACY_URL, STORE_PDP_URI, STORE_REVIEW_URI, STORE_URL, SUPPORT_EMAIL, WEBSITE_URL } from '../../shared/links';
import { openManual } from './windows';

/**
 * Menú de la aplicación en español. Se omiten deshacer/rehacer de edición
 * porque Ctrl+Z está reservado para "deshacer último número".
 */
export function buildMenu(opts: {
  operator: () => BrowserWindow | null;
  openPublic: () => void;
  closePublic: () => void;
  togglePublicFullscreen: () => void;
}): Menu {
  const dev = !app.isPackaged;
  const template: MenuItemConstructorOptions[] = [
    {
      label: '&Archivo',
      submenu: [{ label: 'Salir', role: 'quit', accelerator: 'Alt+F4' }],
    },
    {
      label: '&Edición',
      submenu: [
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
    {
      label: '&Ver',
      submenu: [
        { label: 'Pantalla completa', role: 'togglefullscreen', accelerator: 'F11' },
        { type: 'separator' },
        { label: 'Aumentar tamaño', role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
        { label: 'Reducir tamaño', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        ...(dev ? [{ type: 'separator' } as const, { label: 'Recargar', role: 'reload' } as const, { label: 'Herramientas de desarrollo', role: 'toggleDevTools' } as const] : []),
      ],
    },
    {
      label: 'Ventana &pública',
      submenu: [
        { label: 'Abrir en el proyector', click: () => opts.openPublic() },
        { label: 'Pantalla completa / ventana', click: () => opts.togglePublicFullscreen() },
        { label: 'Cerrar ventana pública', click: () => opts.closePublic() },
      ],
    },
    {
      label: 'A&yuda',
      submenu: [
        { label: 'Manual de usuario', accelerator: 'F1', click: () => openManual() },
        { label: 'Atajos de teclado', click: () => openManual('atajos') },
        { label: 'Problemas frecuentes', click: () => openManual('problemas') },
        { label: 'Política de privacidad (en el navegador)', click: () => void shell.openExternal(PRIVACY_URL) },
        { type: 'separator' },
        { label: 'Sitio web de Bingo Master', click: () => void shell.openExternal(WEBSITE_URL) },
        { label: 'Ver en Microsoft Store', click: () => void shell.openExternal(STORE_PDP_URI).catch(() => shell.openExternal(STORE_URL)) },
        { label: 'Calificar Bingo Master en Microsoft Store', click: () => void shell.openExternal(STORE_REVIEW_URI).catch(() => shell.openExternal(STORE_URL)) },
        { label: 'Apoyar Bingo Master (donar con PayPal)', click: () => void shell.openExternal(DONATE_URL) },
        { label: 'Escribir a soporte', click: () => void shell.openExternal(`mailto:${SUPPORT_EMAIL}?subject=Bingo%20Master%20${app.getVersion()}`) },
        { type: 'separator' },
        {
          label: 'Acerca de BingoMaster',
          click: () => {
            const win = opts.operator();
            const info = {
              type: 'info' as const,
              title: 'Acerca de BingoMaster',
              message: `BingoMaster ${app.getVersion()}`,
              detail: `Conducción de bingos presenciales.\n© 2026 Sergio Aedo Mena · ${WEBSITE_URL}\nSoporte: ${SUPPORT_EMAIL}\nApoye el proyecto: ${DONATE_URL}\n\nElectron ${process.versions.electron} · Node ${process.versions.node}\nDatos: ${app.getPath('userData')}`,
              buttons: ['Cerrar'],
            };
            void (win ? dialog.showMessageBox(win, info) : dialog.showMessageBox(info));
          },
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
