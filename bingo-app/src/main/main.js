'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { Settings } = require('./settings');
const { leerCartones } = require('./vision');

let store;
let settings;
let ventana;
let vigilante = null;

const EXT_IMAGEN = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const MAX_BYTES_IMAGEN = 25 * 1024 * 1024;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Bingo – Importar cartones externos',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  ventana.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

/**
 * El renderer queda 100% offline: se bloquea toda petición http/https/ws
 * que salga de la ventana. La API de Claude se llama desde el proceso main
 * (Node), que no pasa por este filtro.
 */
function bloquearRedRenderer() {
  session.defaultSession.webRequest.onBeforeRequest((det, cb) => {
    const permitido = det.url.startsWith('file:') || det.url.startsWith('data:') ||
      det.url.startsWith('blob:') || det.url.startsWith('devtools:');
    cb({ cancel: !permitido });
  });
  // Solo se concede la cámara (getUserMedia).
  session.defaultSession.setPermissionRequestHandler((wc, permiso, cb, det) => {
    const soloVideo = permiso === 'media' && det && Array.isArray(det.mediaTypes) &&
      det.mediaTypes.length > 0 && det.mediaTypes.every((t) => t === 'video');
    cb(soloVideo);
  });
  session.defaultSession.setPermissionCheckHandler((wc, permiso) => permiso === 'media');
}

function nombreSeguro(nombre) {
  const base = path.basename(String(nombre || ''));
  if (!base || base !== nombre || base.startsWith('.')) return null;
  return base;
}

function listarCarpeta() {
  const dir = settings.valores.carpetaCompartida;
  if (!dir) return { ok: true, carpeta: '', archivos: [] };
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return { ok: false, mensaje: 'No se puede leer la carpeta: ' + e.message };
  }
  const procesadas = store.procesadas();
  const archivos = entradas
    .filter((e) => e.isFile() && EXT_IMAGEN[path.extname(e.name).toLowerCase()])
    .map((e) => {
      const st = fs.statSync(path.join(dir, e.name));
      const clave = e.name + '|' + st.size + '|' + st.mtimeMs;
      return { nombre: e.name, tamano: st.size, modificado: st.mtimeMs, clave, procesada: !!procesadas[clave] };
    })
    .sort((a, b) => b.modificado - a.modificado);
  return { ok: true, carpeta: dir, archivos };
}

function vigilarCarpeta() {
  if (vigilante) { vigilante.close(); vigilante = null; }
  const dir = settings.valores.carpetaCompartida;
  if (!dir) return;
  try {
    let espera = null;
    vigilante = fs.watch(dir, () => {
      // Agrupa ráfagas de eventos (el archivo se está copiando).
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (ventana && !ventana.isDestroyed()) ventana.webContents.send('carpeta:cambio');
      }, 800);
    });
    vigilante.on('error', () => { /* carpeta desmontada: se ignora */ });
  } catch (_) {
    vigilante = null;
  }
}

function registrarIpc() {
  ipcMain.handle('ajustes:obtener', () => settings.publicos());
  ipcMain.handle('ajustes:actualizar', (e, parcial) => {
    const r = settings.actualizar(parcial);
    if (parcial && 'carpetaCompartida' in parcial) vigilarCarpeta();
    return r;
  });
  ipcMain.handle('ajustes:guardarApiKey', (e, key) => {
    try { settings.guardarApiKey(key); return { ok: true, ajustes: settings.publicos() }; }
    catch (err) { return { ok: false, mensaje: err.message }; }
  });
  ipcMain.handle('ajustes:borrarApiKey', () => { settings.borrarApiKey(); return settings.publicos(); });

  ipcMain.handle('eventos:listar', () => store.listarEventos());
  ipcMain.handle('eventos:crear', (e, nombre) => {
    try {
      const ev = store.crearEvento(nombre);
      settings.actualizar({ eventoActivo: ev.id });
      return { ok: true, evento: ev };
    } catch (err) { return { ok: false, mensaje: err.message }; }
  });

  ipcMain.handle('vision:leer', (e, p) => leerCartones({
    apiKey: settings.apiKey(),
    modelo: settings.valores.modelo,
    dobleLectura: settings.valores.dobleLectura,
    imagenBase64: p && p.imagenBase64,
    mediaType: p && p.mediaType,
    cantidadEsperada: p && p.cantidadEsperada,
  }));

  ipcMain.handle('cartones:duplicado', (e, p) =>
    store.buscarDuplicado(settings.valores.eventoActivo, p && p.serie, p && p.folio));
  ipcMain.handle('cartones:guardar', (e, p) => {
    const r = store.guardarCarton(Object.assign({}, p, { eventoId: settings.valores.eventoActivo }));
    if (r.ok && p && p.claveArchivo) store.marcarProcesada(p.claveArchivo);
    return r;
  });
  ipcMain.handle('cartones:listar', () => store.listarCartones(settings.valores.eventoActivo));
  ipcMain.handle('cartones:buscarFolio', (e, folio) => store.buscarPorFolio(settings.valores.eventoActivo, folio));

  ipcMain.handle('carpeta:elegir', async () => {
    const r = await dialog.showOpenDialog(ventana, { properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return settings.publicos();
    const a = settings.actualizar({ carpetaCompartida: r.filePaths[0] });
    vigilarCarpeta();
    return a;
  });
  ipcMain.handle('carpeta:listar', () => listarCarpeta());
  ipcMain.handle('carpeta:leer', (e, nombre) => {
    const dir = settings.valores.carpetaCompartida;
    const n = nombreSeguro(nombre);
    if (!dir || !n) return { ok: false, mensaje: 'Archivo no válido' };
    const mediaType = EXT_IMAGEN[path.extname(n).toLowerCase()];
    if (!mediaType) return { ok: false, mensaje: 'Formato no soportado' };
    const ruta = path.join(dir, n);
    const st = fs.statSync(ruta);
    if (st.size > MAX_BYTES_IMAGEN) return { ok: false, mensaje: 'Imagen demasiado grande' };
    return { ok: true, base64: fs.readFileSync(ruta).toString('base64'), mediaType, clave: n + '|' + st.size + '|' + st.mtimeMs };
  });
}

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  store = new Store(dir);
  settings = new Settings(dir, safeStorage);
  bloquearRedRenderer();
  registrarIpc();
  vigilarCarpeta();
  crearVentana();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) crearVentana(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
