import { BrowserWindow } from 'electron';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CardView, PrintOptions } from '../../shared/ipc/contract';
import { buildPrintHtml } from './html';

/** Genera el PDF en una ventana oculta y sin red (todo es local). */
export async function renderPdf(cards: CardView[], eventName: string, opts: PrintOptions, outPath: string): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'bingomaster-print-'));
  const html = join(dir, 'cartones.html');
  writeFileSync(html, buildPrintHtml(cards, eventName, opts), 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadFile(html);
    const pdf = await win.webContents.printToPDF({
      pageSize: opts.paper,
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    });
    writeFileSync(outPath, pdf);
  } finally {
    win.destroy();
    rmSync(dir, { recursive: true, force: true });
  }
}
