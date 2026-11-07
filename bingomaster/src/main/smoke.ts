/**
 * Prueba de humo del ejecutable empaquetado (se usa en CI de Windows):
 *   BingoMaster.exe --smoke-test
 * Abre una BD temporal, canta y deshace números, la reabre y sale con 0 si
 * todo está bien. Verifica que node:sqlite funciona dentro del .exe.
 */
import { app } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCall, listCurrentCalls, undoLastCall } from './calls/calls';
import { openDatabase } from './db/database';
import { generateOwnCards } from './cards/cards';
import { ensureActiveEvent } from './events/events';
import { ensureBuiltinPatterns } from './patterns/patterns';
import { checkClaim } from './winners/winners';

/** En Windows una app con ventana no muestra stdout: el resultado también va a un archivo. */
function report(line: string): void {
  const out = process.env['BINGOMASTER_SMOKE_OUT'];
  if (out) writeFileSync(out, line + '\n');
}

export function runSmokeTest(): void {
  app.whenReady().then(() => {
    try {
      const path = join(mkdtempSync(join(tmpdir(), 'bingomaster-smoke-')), 'smoke.db');
      let db = openDatabase(path);
      ensureBuiltinPatterns(db);
      const ev = ensureActiveEvent(db, '2026-01-01');
      const gen = generateOwnCards(db, ev.id, 50);
      if (gen.created !== 50) throw new Error('no generó cartones');
      for (const n of [5, 20, 40]) {
        const r = addCall(db, ev.id, n);
        if (!r.ok) throw new Error(r.error);
      }
      if (addCall(db, ev.id, 20).ok) throw new Error('aceptó un repetido');
      if (!undoLastCall(db, ev.id).ok) throw new Error('no deshizo');
      db.close();
      db = openDatabase(path);
      const calls = listCurrentCalls(db, ev.id).map((c) => c.number).join(',');
      const claim = checkClaim(db, ev.id, 1);
      if (typeof claim.valid !== 'boolean') throw new Error('validación');
      db.close();
      if (calls !== '5,20') throw new Error('estado recuperado incorrecto: ' + calls);
      const ok = `SMOKE_OK electron=${process.versions.electron} node=${process.versions.node} platform=${process.platform}`;
      console.log(ok);
      report(ok);
      app.exit(0);
    } catch (err) {
      console.error('SMOKE_FAIL', err);
      report('SMOKE_FAIL ' + String(err));
      app.exit(1);
    }
  });
}
