/** HTML imprimible de cartones (se convierte a PDF con printToPDF). */
import { LETTERS } from '../../shared/bingo/numbers';
import type { CardView, PrintOptions } from '../../shared/ipc/contract';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function cardHtml(c: CardView, eventName: string): string {
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) {
    const cells: string[] = [];
    for (let col = 0; col < 5; col++) {
      const v = c.grid[col]?.[r];
      cells.push(v === null || v === undefined ? '<td class="free">FREE</td>' : `<td>${v}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `
  <section class="card">
    <header>
      <div class="ev">${esc(eventName)}</div>
      <div class="id"><span>Serie</span> <b>${esc(c.series)}</b> &nbsp; <span>Folio</span> <b class="folio">${esc(c.folio)}</b></div>
    </header>
    <table>
      <thead><tr>${LETTERS.map((l) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    <footer>${esc(c.series)}-${esc(c.folio)}</footer>
  </section>`;
}

/** Medidas en mm de la hoja (vertical). */
const PAPER = { Letter: [215.9, 279.4], A4: [210, 297] } as const;

export function buildPrintHtml(cards: CardView[], eventName: string, opts: PrintOptions): string {
  const [w, h] = PAPER[opts.paper];
  const per = opts.perPage;
  // 1 por hoja: cartón grande; 2: uno sobre otro; 4: 2x2.
  const cols = per === 4 ? 2 : 1;
  const rows = per === 1 ? 1 : 2;
  const cellW = w / cols;
  const cellH = h / rows;
  const size = Math.min(cellW, cellH * 0.8) * 0.82; // ancho del cartón en mm
  const pages: string[] = [];
  for (let i = 0; i < cards.length; i += per) {
    const slots = cards.slice(i, i + per).map((c) => `<div class="slot">${cardHtml(c, eventName)}</div>`);
    while (slots.length < per) slots.push('<div class="slot empty"></div>');
    pages.push(`<div class="page">${slots.join('')}</div>`);
  }
  const fs = size / 9; // tamaño de número en mm
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cartones</title><style>
  @page { size: ${opts.paper === 'A4' ? 'A4' : 'letter'} portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: "Segoe UI", Arial, Helvetica, sans-serif; color: #000; }
  .page { width: ${w}mm; height: ${h}mm; display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr);
          page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  /* Líneas de corte entre cartones */
  .slot { display: flex; align-items: center; justify-content: center; border-right: 0.3mm dashed #999; border-bottom: 0.3mm dashed #999; }
  .slot:nth-child(${cols}n) { border-right: none; }
  .slot:nth-last-child(-n + ${cols}) { border-bottom: none; }
  .card { width: ${size}mm; border: 0.8mm solid #000; border-radius: 3mm; padding: ${size * 0.03}mm; }
  .card header { display: flex; flex-direction: column; gap: ${size * 0.008}mm; margin-bottom: ${size * 0.02}mm; }
  .ev { font-weight: 700; font-size: ${fs * 0.42}mm; line-height: 1.15; text-align: center; overflow-wrap: anywhere; }
  .id { font-size: ${fs * 0.38}mm; white-space: nowrap; text-align: center; }
  .id span { color: #444; }
  .id b { font-size: ${fs * 0.5}mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { font-size: ${fs * 0.95}mm; font-weight: 900; color: #fff; background: #000; padding: ${fs * 0.08}mm 0; }
  td { border: 0.5mm solid #000; text-align: center; font-weight: 800; font-size: ${fs}mm; height: ${size * 0.165}mm; }
  td.free { font-size: ${fs * 0.42}mm; letter-spacing: .4mm; background: #e6e6e6; }
  .card footer { text-align: right; font-size: ${fs * 0.3}mm; color: #444; margin-top: ${size * 0.015}mm; }
  </style></head><body>${pages.join('')}</body></html>`;
}
