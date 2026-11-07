/*
 * Prueba de punta a punta de todas las fases con Electron real (Playwright).
 * La API de Claude se simula con un servidor local (no se usa la real).
 * Uso: npm run build && xvfb-run -a node tests/e2e/full.e2e.cjs [carpeta-capturas]
 */
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'bm-shots-'));
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-ud-'));
// Con MANUAL_SHOTS=<carpeta> además guarda capturas limpias (sin avisos ni ruta de datos) para el manual.
const MANUAL = process.env.MANUAL_SHOTS || '';
const styled = new WeakSet();
async function shot(page, name, manualName) {
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  if (!MANUAL || !manualName) return;
  if (!styled.has(page)) { await page.addStyleTag({ content: '.toasts, .op-footer { visibility: hidden !important; } .notice { display: none !important; }' }); styled.add(page); }
  await page.waitForTimeout(250);
  if (process.env.MANUAL_FORMAT === 'png') await page.screenshot({ path: path.join(MANUAL, manualName + '.png'), type: 'png' });
  else await page.screenshot({ path: path.join(MANUAL, manualName + '.jpg'), type: 'jpeg', quality: 80 });
}

// Cartón externo de prueba (por columnas)
const EXT = [[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, null, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]];
const MAX = [15, 30, 45, 60, 75];

// ---------- API de Claude simulada ----------
let apiRequests = [];
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    apiRequests.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
    const card = (folio, b) => ({
      serie: 'ARROW', folio, completo: true, observaciones: '',
      columnas: { B: b, I: [21, 22, 23, 24, 25], N: [36, 37, null, 38, 39], G: [51, 52, 53, 54, 55], O: [66, 67, 68, 69, 70] },
    });
    const text = JSON.stringify({ cartones: [card('000777', [6, 7, 8, 9, 10]), card('000778', [6, 7, null, 9, 11])] });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } }));
  });
}).listen(0, '127.0.0.1');

async function launch() {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--no-sandbox', `--user-data-dir=${USER_DATA}`],
    env: { ...process.env, ANTHROPIC_BASE_URL: `http://127.0.0.1:${api.address().port}` },
  });
  const op = await app.firstWindow();
  await op.setViewportSize({ width: 1366, height: 768 });
  await op.waitForSelector('.tabs');
  return { app, op };
}
const tab = (op, name) => op.click(`.tabs button:has-text("${name}")`);
const waitToast = async (op, re) => {
  await op.waitForFunction((src) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(src).test(t.textContent)), re.source, { timeout: 10000 });
};

async function cantar(op, n) {
  await op.fill('#num', String(n));
  await op.press('#num', 'Enter');
  await op.waitForTimeout(120);
  return (await op.textContent('#fb')).trim();
}

async function typeCard(op, series, folio, grid) {
  const ids = op.locator('.ce-ids input');
  await ids.nth(0).click();
  await op.keyboard.type(series);
  await op.keyboard.press('Enter');
  await op.keyboard.type(folio);
  await op.keyboard.press('Enter');
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 5; r++) {
      const v = grid[c][r];
      if (v === null) continue;
      const t = String(v);
      await op.keyboard.type(t);
      const complete = t.length >= 2 || Number(t) * 10 > MAX[c];
      if (!complete) await op.keyboard.press('Enter');
    }
  }
}

(async () => {
  if (!api.listening) await new Promise((r) => api.once('listening', r));
  let { app, op } = await launch();
  const errors = [];
  op.on('pageerror', (e) => errors.push('operador: ' + e.message));

  // ---------- Manual de usuario y menú ----------
  const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map((i) => i.label.replace('&', '') + ':' + i.submenu.items.map((s) => s.label).join('|')));
  assert.ok(menu.some((m) => m.startsWith('Ayuda:Manual de usuario')), 'menú Ayuda → Manual de usuario: ' + menu.join(' / '));
  const manP = app.waitForEvent('window');
  await op.click('.help-btn');
  const man = await manP;
  await man.waitForSelector('#rapido');
  assert.equal(await man.title(), 'BingoMaster — Manual de usuario');
  await man.waitForFunction(() => [...document.images].every((i) => i.complete));
  const broken = await man.$$eval('img', (imgs) => imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
  assert.deepEqual(broken, [], 'imágenes del manual');
  assert.ok((await man.$$eval('main section', (x) => x.length)) >= 17);
  await man.fill('#buscar', 'desempate');
  const visibles = await man.$$eval('main section:not([hidden])', (x) => x.map((s) => s.id));
  assert.ok(visibles.includes('bingo') && !visibles.includes('instalacion'), 'búsqueda: ' + visibles);
  await man.fill('#buscar', '');
  await man.setViewportSize({ width: 1180, height: 800 });
  await man.screenshot({ path: path.join(SHOTS, '0-manual.png') });
  // El menú Ayuda → Atajos reutiliza la misma ventana
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((i) => i.label.includes('yuda')).submenu.items[1].click());
  await man.waitForFunction(() => location.hash === '#atajos');
  assert.equal(app.windows().filter((w) => w.url().includes('manual.html')).length, 1);
  await man.close();

  // ---------- F2: evento nuevo ----------
  await tab(op, 'Evento y juegos');
  await op.click('button:has-text("Nuevo evento")');
  await op.fill('.modal input >> nth=0', 'Bingo Parroquia San José');
  await op.fill('.modal input >> nth=2', 'nov26');
  await op.click('.modal button:has-text("Crear y activar")');
  await op.waitForSelector('.op-title h1:has-text("Bingo Parroquia San José")');
  assert.deepEqual(await op.$$eval('ol.games .g-name', (e) => e.map((x) => x.textContent)), [
    'Juego 1 · Primeros 3', 'Juego 2 · Línea (cualquiera)', 'Juego 3 · X', 'Juego 4 · Cartón lleno',
  ]);
  await shot(op, '1-evento-juegos', 'eventos');

  // ---------- F3: figura personalizada (esquinas) ----------
  await tab(op, 'Figuras');
  await op.click('button:has-text("Nueva figura")');
  await op.fill('.modal input >> nth=0', 'Cuatro esquinas');
  for (const i of [0, 4, 20, 24]) await op.click(`.pattern-editor .mask-lg button.mask-cell >> nth=${i}`);
  await shot(op, '2-editor-figura', 'figura-editor');
  await op.click('.modal button:has-text("Guardar figura")');
  await op.waitForSelector('.pattern-card .pc-name:has-text("Cuatro esquinas")');
  await tab(op, 'Evento y juegos');
  await op.selectOption('.add-game select', { label: 'Cuatro esquinas (personalizada)' });
  await op.click('button:has-text("Agregar juego")');
  await op.waitForSelector('ol.games li >> nth=4');

  // ---------- F2: generar cartones y PDF ----------
  await tab(op, 'Cartones');
  await op.fill('.num-in >> nth=0', '40');
  await op.click('button:has-text("Generar")');
  await waitToast(op, /40 cartones: NOV26-0001 a NOV26-0040/);
  const pdfPath = path.join(SHOTS, 'cartones.pdf');
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, pdfPath);
  await op.selectOption('select >> nth=1', 'A4');
  await op.fill('input[placeholder="1"]', '1');
  await op.fill('input[placeholder="40"]', '8');
  await op.click('button:has-text("Exportar PDF")');
  await op.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('PDF guardado')), null, { timeout: 30000 });
  const pdf = fs.readFileSync(pdfPath);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, 2, 'A4, 4 por hoja, folios 1-8 = 2 páginas');
  await shot(op, '3-cartones', 'cartones');

  // ---------- F3: ingreso manual de cartón externo ----------
  await op.click('.subtabs button:has-text("Ingreso manual")');
  await typeCard(op, 'AR-7', '004512', EXT);
  await op.waitForTimeout(150);
  assert.equal(await op.isDisabled('.manual button.primary'), false);
  await shot(op, '4-ingreso-manual', 'ingreso-manual');
  await op.keyboard.press('Control+Enter');
  await waitToast(op, /Cartón externo guardado: AR-7 004512/);
  assert.equal(await op.inputValue('.ce-ids input >> nth=0'), 'AR-7', 'mantiene la serie');
  // Duplicado: no se permite
  await typeCard(op, '', '004512', EXT);
  await op.click('.manual button.primary');
  await op.waitForSelector('.manual .feedback.error:has-text("Ya existe")');

  // ---------- F1/F3: cantar y validar ¡BINGO! ----------
  await tab(op, 'Juego');
  assert.match(await cantar(op, 70), /O-70/);
  await cantar(op, 1);
  await cantar(op, 16);
  assert.equal(await op.textContent('.near > div:nth-child(2) strong') !== null, true);
  await cantar(op, 31);
  const complete = Number(await op.textContent('.near > div:nth-child(1) strong'));
  assert.ok(complete >= 1, 'el externo completa Primeros 3');

  // Ventana pública
  const pubP = app.waitForEvent('window');
  await op.click('button:has-text("Abrir pública")');
  const pub = await pubP;
  pub.on('pageerror', (e) => errors.push('pública: ' + e.message));
  await pub.waitForSelector('.pub-game');
  assert.match(await pub.textContent('.pub-game'), /Juego 1 de 5 — Primeros 3/);

  // ¡BINGO! con folio sin ceros
  await op.focus('#num');
  await op.keyboard.press('F2');
  await op.fill('.bingo-search input', '4512');
  await op.keyboard.press('Enter');
  await op.waitForSelector('.verdict');
  assert.equal(await op.textContent('.verdict'), 'VÁLIDO');
  await shot(op, '5-bingo-valido', 'bingo');
  await op.click('button:has-text("Registrar ganador")');
  await op.click('button:has-text("Mostrar en pantalla pública")');
  await pub.waitForSelector('.pub-overlay');
  assert.match(await pub.textContent('.pub-overlay'), /Folio\s*004512/);
  await pub.setViewportSize({ width: 1920, height: 1080 });
  await pub.waitForTimeout(600);
  await shot(pub, '6-publica-bingo', 'publica-bingo');

  // Un cartón propio cualquiera: NO VÁLIDO
  await op.fill('.bingo-search input', '1');
  await op.keyboard.press('Enter');
  await op.waitForSelector('.choose, .verdict');
  if (await op.$('.choose')) await op.click('.choose button:has-text("NOV26")');
  await op.waitForSelector('.verdict');
  // (puede ser válido si por azar completa con el último número; lo normal es NO VÁLIDO)
  await op.click('.modal-head button');
  // Terminar el juego 1 (tiene ganador) desde el panel derecho
  await op.click('.finish-btn');
  await op.waitForSelector('[role=alertdialog]');
  assert.match(await op.textContent('[role=alertdialog]'), /Tiene 1 ganador/);
  await op.click('[role=alertdialog] button.danger');
  await op.waitForSelector('.game-title:has-text("Línea (cualquiera)")');
  await pub.waitForFunction(() => !document.querySelector('.pub-overlay'));
  assert.match(await pub.textContent('.pub-game'), /Juego 2 de 5 — Línea/);

  // Bingo tardío: la columna B del externo se completa y luego sale otro número
  for (const n of [2, 3, 4, 5]) await cantar(op, n);
  await cantar(op, 75);
  await op.keyboard.press('F2');
  await op.fill('.bingo-search input', 'AR-7 004512');
  await op.keyboard.press('Enter');
  await op.waitForSelector('.verdict');
  assert.equal(await op.textContent('.verdict'), 'NO VÁLIDO');
  assert.match(await op.textContent('.verdict-col p'), /no con el último/);
  await op.click('.modal-head button');

  await pub.waitForTimeout(400);
  await shot(pub, '7-publica-juego', 'publica');
  await shot(op, '8-operador-juego', 'juego');

  // Terminar juegos SIN ganador hasta el último
  for (const next of ['X', 'Cartón lleno', 'Cuatro esquinas']) {
    await op.click('.finish-btn');
    await op.waitForSelector('[role=alertdialog]');
    assert.match(await op.textContent('[role=alertdialog]'), /sin ganador/);
    await op.click('[role=alertdialog] button.danger');
    await op.waitForSelector(`.game-title:has-text("${next}")`);
  }
  assert.match(await op.textContent('.finish-btn'), /^Terminar juego$/, 'en el último juego el botón sigue disponible');
  await op.click('.finish-btn');
  await op.waitForSelector('[role=alertdialog]:has-text("último juego")');
  await op.click('[role=alertdialog] button.danger');
  await op.waitForSelector('.empty-box h2:has-text("Todos los juegos terminaron")');
  await pub.waitForFunction(() => document.querySelector('.pub-game')?.textContent === '¡Gracias por jugar!');
  assert.equal(await op.isDisabled('#num'), true, 'no se canta con todos los juegos terminados');
  await shot(op, '8b-juegos-terminados', 'juegos-terminados');

  // ---------- F5: importación con IA (API simulada) ----------
  await app.evaluate(({ safeStorage }) => {
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.encryptString = (t) => Buffer.from('E' + t);
    safeStorage.decryptString = (b) => b.toString().slice(1);
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
  });
  await tab(op, 'Ajustes');
  await op.fill('input[type=password]', 'sk-ant-prueba');
  await op.click('button:has-text("Guardar cifrada")');
  await op.waitForSelector('text=API key configurada');
  await shot(op, '8c-ajustes', 'ajustes');
  // Respaldo y restauración (diálogos simulados)
  const bkPath = path.join(SHOTS, 'respaldo.db');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, bkPath);
  await op.click('button:has-text("Respaldar base de datos")');
  await waitToast(op, /Respaldo guardado/);
  assert.ok(fs.statSync(bkPath).size > 10000);
  await op.click('button:has-text("Restaurar respaldo")');
  await waitToast(op, /Respaldo restaurado: 2 evento\(s\), 41 cartón/);
  await op.waitForSelector('.notice:has-text("Respaldo restaurado")', { state: 'attached' });
  await op.click('label:has-text("Doble lectura") input');
  await op.waitForFunction(() => document.querySelector('label.chk input[type=checkbox]:checked') !== null);
  await tab(op, 'Importar con IA');
  await shot(op, '8d-importar', 'importar');
  await op.setInputFiles('.drop input[type=file]', path.join(SHOTS, '6-publica-bingo.png'));
  // Aviso de privacidad antes del primer envío: no sale nada hasta aceptar
  await op.waitForSelector('[role=alertdialog]:has-text("Envío de la foto al proveedor de IA")');
  assert.equal(apiRequests.length, 0, 'no se envía nada antes del consentimiento');
  await shot(op, '8e-consentimiento-ia');
  await op.click('[role=alertdialog] button:has-text("Acepto y enviar")');
  await op.waitForSelector('.review', { timeout: 15000 });
  assert.equal(apiRequests.length, 2, 'doble lectura = 2 llamadas');
  const req0 = apiRequests[0];
  assert.equal(req0.body.model, 'claude-opus-5-5');
  assert.equal(req0.body.output_config.format.type, 'json_schema');
  assert.equal(req0.body.messages[0].content[0].type, 'image');
  assert.equal(req0.body.fallbacks, 'default');
  assert.equal(req0.headers['authorization'], 'Bearer sk-ant-prueba'); // SDK 1.x envía la key como Bearer
  assert.match(req0.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  const readings = op.locator('.reading');
  assert.equal(await readings.count(), 2);
  assert.match(await readings.nth(1).textContent(), /DUDOSO/);
  await shot(op, '9-revision-ia', 'revision-ia');
  // Cartón 1: revisar y guardar
  await readings.nth(0).locator('label.chk input').check();
  await readings.nth(0).locator('button:has-text("Confirmar y guardar")').click();
  await op.waitForSelector('.reading.saved');
  // Cartón 2: no se puede guardar hasta corregir la celda vacía
  await readings.nth(1).locator('label.chk input').check();
  assert.equal(await readings.nth(1).locator('button:has-text("Confirmar y guardar")').isDisabled(), true);
  await readings.nth(1).locator('input[aria-label="B fila 3"]').fill('8');
  await readings.nth(1).locator('button:has-text("Confirmar y guardar")').click();
  await op.waitForSelector('.import-grid', { timeout: 5000 });
  await waitToast(op, /2 cartón\(es\) guardado/);

  // ---------- Red bloqueada en ventanas ----------
  assert.equal(await op.evaluate(() => fetch('https://example.com').then(() => 'abierta', () => 'bloqueada')), 'bloqueada');
  assert.equal(await pub.evaluate(() => window.bingo.invoke('calls:add', 9).then((r) => r.code)), 'origen', 'la pública no puede mandar comandos');

  // ---------- Recuperación de sesión ----------
  await app.close();
  ({ app, op } = await launch());
  await op.waitForSelector('.notice');
  assert.match(await op.textContent('.notice'), /Sesión recuperada/);
  await op.waitForSelector('.empty-box h2:has-text("Todos los juegos terminaron")');
  assert.equal(await op.textContent('.op-count strong'), '9');
  await tab(op, 'Cartones');
  await op.waitForSelector('.cards-view h2:has-text("Cartones del evento (43)")');
  await app.close();
  api.close();

  assert.deepEqual(errors, []);
  console.log('E2E COMPLETO OK — capturas en', SHOTS);
})().catch((e) => {
  console.error('E2E FALLÓ:', e);
  api.close();
  process.exit(1);
});
