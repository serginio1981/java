/*
 * Prueba de punta a punta de F1 con Electron real (Playwright).
 * Uso: npm run build && xvfb-run -a node tests/e2e/f1.e2e.cjs [carpeta-capturas]
 * No forma parte de `npm test` (requiere pantalla).
 */
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'bm-shots-'));
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-ud-'));

async function launch() {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--no-sandbox', `--user-data-dir=${USER_DATA}`],
  });
  const op = await app.firstWindow();
  await op.waitForSelector('#num');
  return { app, op };
}

async function cantar(op, n) {
  await op.fill('#num', String(n));
  await op.press('#num', 'Enter');
  await op.waitForTimeout(150);
  return (await op.textContent('#fb')).trim();
}

(async () => {
  let { app, op } = await launch();
  const errors = [];
  op.on('pageerror', (e) => errors.push(e.message));

  assert.match(await cantar(op, 12), /B-12 — número 1/);
  assert.match(await cantar(op, 12), /ya salió/);
  assert.match(await cantar(op, 76), /fuera de rango/);
  assert.match(await cantar(op, 'G12'), /no es de la G/);
  assert.equal(await op.inputValue('#num'), 'G12', 'el valor inválido queda para corregir');
  assert.equal(await op.evaluate(() => document.activeElement.id), 'num', 'el foco vuelve al campo');

  // Clic en el tablero solo selecciona; Enter canta.
  await op.click('.board-cell.l-N >> text="45"');
  assert.equal(await op.inputValue('#num'), '45');
  await op.press('#num', 'Enter');
  await op.waitForTimeout(150);
  assert.equal(await op.textContent('.op-count strong'), '2');

  // Ventana pública
  const pubPromise = app.waitForEvent('window');
  await op.click('.pub-controls button:has-text("Abrir")');
  const pub = await pubPromise;
  pub.on('pageerror', (e) => errors.push('pública: ' + e.message));
  await pub.waitForSelector('.pub-ball');
  assert.equal(await pub.textContent('.pub-ball strong'), '45');
  assert.equal(await pub.textContent('.pub-count strong'), '2');
  // La pública no recibe datos del operador
  const pubKeys = await pub.evaluate(() => window.bingo.invoke('state:get').then((s) => Object.keys(s).sort().join(',')));
  assert.equal(pubKeys, 'calls,count,event,last,lastFive');

  for (const n of [61, 22, 50, 3]) await cantar(op, n);
  await pub.waitForFunction(() => document.querySelector('.pub-ball strong')?.textContent === '3');
  assert.equal(await pub.$$eval('.pub-mini', (e) => e.map((x) => x.textContent).join(' ')), 'G50 I22 O61 N45');

  await pub.setViewportSize({ width: 1920, height: 1080 });
  await pub.waitForTimeout(800);
  await pub.screenshot({ path: path.join(SHOTS, 'f1-publica.png') });

  // Deshacer con la tecla "−" y confirmar
  await op.focus('#num');
  await op.keyboard.press('Minus');
  await op.waitForSelector('[role=alertdialog]');
  assert.match(await op.textContent('[role=alertdialog]'), /B-3/);
  await op.screenshot({ path: path.join(SHOTS, 'f1-deshacer.png') });
  await op.click('[role=alertdialog] button.danger');
  await pub.waitForFunction(() => document.querySelector('.pub-ball strong')?.textContent === '50');
  assert.equal(await op.textContent('.op-count strong'), '5');
  await op.screenshot({ path: path.join(SHOTS, 'f1-operador.png') });

  // Cancelar deshacer con Enter (el foco está en Cancelar)
  await op.keyboard.press('Control+z');
  await op.waitForSelector('[role=alertdialog]');
  await op.keyboard.press('Enter');
  await op.waitForTimeout(150);
  assert.equal(await op.textContent('.op-count strong'), '5');

  // Recuperación de sesión: cerrar y reabrir
  await app.close();
  ({ app, op } = await launch());
  await op.waitForSelector('.op-count strong');
  assert.equal(await op.textContent('.op-count strong'), '5');
  assert.equal(await op.textContent('.op-last-ball strong'), '50');
  assert.match(await cantar(op, 50), /ya salió/);

  // Red bloqueada en las ventanas
  const red = await op.evaluate(() => fetch('https://example.com').then(() => 'abierta', () => 'bloqueada'));
  assert.equal(red, 'bloqueada');

  await app.close();
  assert.deepEqual(errors, []);
  console.log('E2E F1 OK — capturas en', SHOTS);
})().catch((e) => {
  console.error('E2E F1 FALLÓ:', e);
  process.exit(1);
});
