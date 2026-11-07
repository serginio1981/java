import { app, dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
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
        { type: 'separator' },
        {
          label: 'Acerca de BingoMaster',
          click: () => {
            const win = opts.operator();
            const info = {
              type: 'info' as const,
              title: 'Acerca de BingoMaster',
              message: `BingoMaster ${app.getVersion()}`,
              detail: `Conducción de bingos presenciales.\nElectron ${process.versions.electron} · Node ${process.versions.node}\nDatos: ${app.getPath('userData')}`,
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
