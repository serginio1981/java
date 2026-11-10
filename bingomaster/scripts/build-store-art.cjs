/*
 * Genera las imágenes de la ficha de Microsoft Store a partir de build/icon.svg.
 * Uso (requiere playwright con Chromium): node scripts/build-store-art.cjs
 * Salida: store/imagenes/*.png
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'store', 'imagenes');
fs.mkdirSync(out, { recursive: true });
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
const ball = (size, extra = '') => `<div style="width:${size}px;height:${size}px;${extra}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>`;

const FONT = `'Segoe UI', 'Inter', Arial, sans-serif`;
const BG = 'radial-gradient(circle at 75% 20%, #3a5180 0%, #1d2a44 55%, #121a2c 100%)';
const mini = (n, color, ink, size, x, y, rot = 0) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 65%, #fff), ${color} 50%, color-mix(in srgb, ${color} 70%, #000));
  display:grid;place-items:center;font:900 ${Math.round(size * 0.42)}px ${FONT};color:${ink};transform:rotate(${rot}deg);
  box-shadow:0 ${Math.round(size * 0.08)}px ${Math.round(size * 0.25)}px rgba(0,0,0,.35)">${n}</div>`;
const balls = (k) => [
  mini('B 7', '#2f7cff', '#fff', 150 * k, 1250 * k, 160 * k, -12),
  mini('I 22', '#ff3d57', '#fff', 120 * k, 1520 * k, 420 * k, 8),
  mini('N 41', '#e8eaf0', '#111', 135 * k, 1180 * k, 560 * k, 4),
  mini('G 53', '#20c464', '#06210f', 160 * k, 1460 * k, 700 * k, -6),
  mini('O 68', '#ffb020', '#2a1a00', 125 * k, 1700 * k, 180 * k, 14),
].join('');

const jobs = [
  // Imágenes para mostrar en Store (ícono transparente)
  { name: 'icono-300x300.png', w: 300, h: 300, html: ball(300), transparent: true },
  { name: 'icono-150x150.png', w: 150, h: 150, html: ball(150), transparent: true },
  { name: 'icono-71x71.png', w: 71, h: 71, html: ball(71), transparent: true },
  // Arte de caja 1:1 (recomendado; incluye el título)
  {
    name: 'arte-caja-1080x1080.png', w: 1080, h: 1080,
    html: `<div style="width:1080px;height:1080px;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
      ${ball(560, 'filter:drop-shadow(0 30px 60px rgba(0,0,0,.45))')}
      <div style="font:800 110px ${FONT};color:#fff;letter-spacing:1px">Bingo Master</div></div>`,
  },
  {
    name: 'arte-caja-2160x2160.png', w: 2160, h: 2160,
    html: `<div style="width:2160px;height:2160px;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:80px">
      ${ball(1120, 'filter:drop-shadow(0 60px 120px rgba(0,0,0,.45))')}
      <div style="font:800 220px ${FONT};color:#fff;letter-spacing:2px">Bingo Master</div></div>`,
  },
  // Arte de póster 9:16 (incluye el título)
  {
    name: 'arte-poster-720x1080.png', w: 720, h: 1080,
    html: `<div style="width:720px;height:1080px;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;text-align:center">
      ${ball(440, 'filter:drop-shadow(0 24px 48px rgba(0,0,0,.45))')}
      <div style="font:800 86px/1.05 ${FONT};color:#fff">Bingo<br>Master</div>
      <div style="font:600 30px ${FONT};color:#c9d2e3">Conduce bingos presenciales</div></div>`,
  },
  {
    name: 'arte-poster-1440x2160.png', w: 1440, h: 2160,
    html: `<div style="width:1440px;height:2160px;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:72px;text-align:center">
      ${ball(880, 'filter:drop-shadow(0 48px 96px rgba(0,0,0,.45))')}
      <div style="font:800 172px/1.05 ${FONT};color:#fff">Bingo<br>Master</div>
      <div style="font:600 60px ${FONT};color:#c9d2e3">Conduce bingos presenciales</div></div>`,
  },
  // Arte de superhéroe 16:9 (SIN el título del producto)
  {
    name: 'superheroe-1920x1080.png', w: 1920, h: 1080,
    html: `<div style="position:relative;width:1920px;height:1080px;background:${BG};overflow:hidden">
      <div style="position:absolute;left:220px;top:190px">${ball(700, 'filter:drop-shadow(0 40px 80px rgba(0,0,0,.5))')}</div>${balls(1)}</div>`,
  },
  {
    name: 'superheroe-3840x2160.png', w: 3840, h: 2160,
    html: `<div style="position:relative;width:3840px;height:2160px;background:${BG};overflow:hidden">
      <div style="position:absolute;left:440px;top:380px">${ball(1400, 'filter:drop-shadow(0 80px 160px rgba(0,0,0,.5))')}</div>${balls(2)}</div>`,
  },
];

(async () => {
  const b = await chromium.launch();
  for (const j of jobs) {
    const p = await b.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent">${j.html}</body></html>`);
    await p.screenshot({ path: path.join(out, j.name), omitBackground: !!j.transparent });
    await p.close();
    console.log('✓', j.name);
  }
  await b.close();
})();
