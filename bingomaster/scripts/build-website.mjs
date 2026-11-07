#!/usr/bin/env node
/**
 * Genera website/privacidad.html a partir de PRIVACIDAD.md (fuente única).
 * Uso: node scripts/build-website.mjs
 * Convierte el subconjunto de Markdown que usa la política: títulos, párrafos,
 * listas, tablas, negrita, código, enlaces y separadores.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'PRIVACIDAD.md'), 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const ext = /^https?:/.test(href);
    return `<a href="${href}"${ext ? ' rel="noopener"' : ''}>${text}</a>`;
  });
  return out;
}

const lines = md.split(/\r?\n/);
const html = [];
let para = [];
let list = null; // 'ul' | 'ol'
const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const t = line.trim();
  if (!t) { flushPara(); closeList(); continue; }
  if (/^---+$/.test(t)) { flushPara(); closeList(); html.push('<hr>'); continue; }
  const h = /^(#{1,4})\s+(.*)$/.exec(t);
  if (h) {
    flushPara(); closeList();
    const level = h[1].length;
    const id = h[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    html.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
    continue;
  }
  if (t.startsWith('|')) {
    flushPara(); closeList();
    const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
    i--;
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const [head, , ...body] = rows;
    html.push('<table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
    for (const r of body) html.push('<tr>' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    html.push('</tbody></table>');
    continue;
  }
  const ul = /^[-*]\s+(.*)$/.exec(t);
  const ol = /^\d+\.\s+(.*)$/.exec(t);
  if (ul || ol) {
    flushPara();
    const type = ul ? 'ul' : 'ol';
    if (list !== type) { closeList(); html.push(`<${type}>`); list = type; }
    let item = (ul ?? ol)[1];
    // líneas de continuación (sangradas)
    while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i + 1])) { item += ' ' + lines[++i].trim(); }
    html.push(`<li>${inline(item)}</li>`);
    continue;
  }
  closeList();
  // "Clave:" en líneas consecutivas del encabezado → cada una en su línea
  if (/^\*\*[^*]+:\*\*/.test(t) && para.length) { flushPara(); }
  para.push(t);
}
flushPara(); closeList();

const page = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Política de privacidad — Bingo Master</title>
  <meta name="description" content="Política de privacidad de la aplicación Bingo Master para Windows: qué datos maneja, dónde se guardan y cuándo salen del equipo.">
  <link rel="canonical" href="https://bingomaster.net/privacidad.html">
  <link rel="icon" href="img/icon.svg" type="image/svg+xml">
  <link rel="icon" href="img/icon-32.png" sizes="32x32" type="image/png">
  <meta name="theme-color" content="#1d2a44">
  <link rel="stylesheet" href="estilos.css">
</head>
<body>
<header class="barra">
  <div class="contenedor barra-in">
    <a href="./" class="marca"><img src="img/icon.svg" alt="" width="36" height="36"> Bingo Master</a>
    <nav aria-label="Principal"><a href="./">Inicio</a><a href="mailto:contacto@saedo.cl">Contacto</a></nav>
  </div>
</header>
<main class="legal">
  <div class="contenedor angosto">
    <a class="volver" href="./">← Volver al inicio</a>
    <article>
${html.map((l) => '      ' + l).join('\n')}
    </article>
  </div>
</main>
<footer class="pie">
  <div class="contenedor pie-in">
    <div class="marca"><img src="img/icon.svg" alt="" width="28" height="28"> Bingo Master</div>
    <nav aria-label="Legal"><a href="privacidad.html">Política de privacidad</a><a href="mailto:contacto@saedo.cl">contacto@saedo.cl</a></nav>
    <p>© 2026 Sergio Aedo Mena. Este documento se genera a partir de PRIVACIDAD.md.</p>
  </div>
</footer>
</body>
</html>
`;
writeFileSync(join(root, 'website', 'privacidad.html'), page, 'utf8');
console.log('website/privacidad.html generado');
