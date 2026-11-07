/**
 * Editor rápido de cartón 5x5 (ingreso manual y corrección de lecturas de IA).
 * - Serie → Enter → Folio → Enter → 24 números.
 * - El cursor avanza solo cuando el número ya no admite otro dígito.
 * - Enter/Tab avanza, Retroceso en celda vacía vuelve, flechas se mueven.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { isCenter, validateGrid, type Grid } from '../../shared/bingo/grid';
import { LETTERS, RANGES } from '../../shared/bingo/numbers';

export interface CardDraft { series: string; folio: string; cells: string[][] } // cells[col][row] texto

export const draftFrom = (series: string, folio: string, grid: Grid | null): CardDraft => ({
  series, folio,
  cells: [0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => {
    const v = grid?.[c]?.[r];
    return v === null || v === undefined ? '' : String(v);
  })),
});

export function draftGrid(d: CardDraft): Grid {
  return d.cells.map((col, c) => col.map((t, r) => {
    if (isCenter(c, r)) return null;
    return /^\d{1,2}$/.test(t) ? parseInt(t, 10) : null;
  }));
}

export interface CardEditorHandle {
  focusFirst(): void;
  focusFolio(): void;
  press(key: string): void;
}

type Order = { c: number; r: number }[];
const ORDER_COLS: Order = [];
const ORDER_ROWS: Order = [];
for (let c = 0; c < 5; c++) for (let r = 0; r < 5; r++) if (!isCenter(c, r)) ORDER_COLS.push({ c, r });
for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!isCenter(c, r)) ORDER_ROWS.push({ c, r });

const complete = (c: number, t: string): boolean => {
  if (!/^\d+$/.test(t)) return false;
  if (t.length >= 2) return true;
  const max = RANGES[LETTERS[c] as keyof typeof RANGES][1];
  return parseInt(t, 10) * 10 > max;
};

export const CardEditor = forwardRef<CardEditorHandle, {
  value: CardDraft;
  onChange: (d: CardDraft) => void;
  doubtful?: string[];
  seriesDoubtful?: boolean;
  folioDoubtful?: boolean;
  order?: 'cols' | 'rows';
  onDone?: () => void;
  disabled?: boolean;
}>(function CardEditor(p, ref) {
  const order = p.order === 'rows' ? ORDER_ROWS : ORDER_COLS;
  const seriesRef = useRef<HTMLInputElement>(null);
  const folioRef = useRef<HTMLInputElement>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastFocus = useRef<HTMLInputElement | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const check = useMemo(() => validateGrid(draftGrid(p.value)), [p.value]);

  useEffect(() => setReviewed(new Set()), [p.doubtful]);

  const key = (c: number, r: number) => `${c},${r}`;
  const go = (i: number): void => {
    if (i < 0) { folioRef.current?.focus(); folioRef.current?.select(); return; }
    const o = order[i];
    if (!o) { p.onDone?.(); return; }
    const el = cellRefs.current[key(o.c, o.r)];
    el?.focus();
    el?.select();
  };
  const idx = (c: number, r: number) => order.findIndex((o) => o.c === c && o.r === r);

  function setCell(c: number, r: number, t: string): void {
    const cells = p.value.cells.map((col) => [...col]);
    (cells[c] as string[])[r] = t;
    setReviewed((s) => new Set(s).add(key(c, r)));
    p.onChange({ ...p.value, cells });
  }

  useImperativeHandle(ref, () => ({
    focusFirst: () => { seriesRef.current?.focus(); seriesRef.current?.select(); },
    focusFolio: () => { folioRef.current?.focus(); folioRef.current?.select(); },
    press: (k: string) => {
      const el = lastFocus.current ?? seriesRef.current;
      if (!el) return;
      const c = el.dataset['c'];
      const r = el.dataset['r'];
      if (k === 'enter') { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return; }
      if (c !== undefined && r !== undefined) {
        const cc = Number(c);
        const rr = Number(r);
        const cur = p.value.cells[cc]?.[rr] ?? '';
        if (k === 'back') {
          if (cur === '') go(idx(cc, rr) - 1);
          else { setCell(cc, rr, cur.slice(0, -1)); el.focus(); }
          return;
        }
        const next = (cur + k).slice(0, 2);
        setCell(cc, rr, next);
        if (complete(cc, next)) go(idx(cc, rr) + 1); else el.focus();
        return;
      }
      // serie o folio
      const isSeries = el === seriesRef.current;
      const field = isSeries ? 'series' : 'folio';
      const cur = p.value[field];
      p.onChange({ ...p.value, [field]: k === 'back' ? cur.slice(0, -1) : cur + k });
      el.focus();
    },
  }));

  const doubtful = new Set((p.doubtful ?? []).filter((k) => !reviewed.has(k)));

  return (
    <div className="card-editor">
      <div className="ce-ids">
        <label>Serie
          <input ref={seriesRef} value={p.value.series} disabled={p.disabled} spellCheck={false} autoComplete="off"
            className={p.seriesDoubtful ? 'doubtful' : ''}
            onFocus={(e) => { lastFocus.current = e.currentTarget; }}
            onChange={(e) => p.onChange({ ...p.value, series: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); folioRef.current?.focus(); folioRef.current?.select(); } }} />
        </label>
        <label>Folio *
          <input ref={folioRef} value={p.value.folio} disabled={p.disabled} spellCheck={false} autoComplete="off"
            className={(p.folioDoubtful ? 'doubtful ' : '') + (!p.value.folio.trim() ? 'invalid' : '')}
            onFocus={(e) => { lastFocus.current = e.currentTarget; }}
            onChange={(e) => p.onChange({ ...p.value, folio: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(0); } }} />
        </label>
      </div>
      <table className="ce-grid">
        <thead><tr>{LETTERS.map((l) => <th key={l} className={`l-${l}`}>{l}</th>)}</tr></thead>
        <tbody>
          {[0, 1, 2, 3, 4].map((r) => (
            <tr key={r}>
              {[0, 1, 2, 3, 4].map((c) => {
                if (isCenter(c, r)) return <td key={c} className="free">FREE</td>;
                const k = key(c, r);
                const t = p.value.cells[c]?.[r] ?? '';
                const err = check.cells[k];
                const cls = [doubtful.has(k) ? 'doubtful' : '', err && t !== '' ? 'invalid' : '', t === '' ? 'empty' : ''].join(' ');
                const letter = LETTERS[c] as keyof typeof RANGES;
                return (
                  <td key={c}>
                    <input
                      ref={(el) => { cellRefs.current[k] = el; }}
                      data-c={c} data-r={r}
                      className={cls}
                      value={t}
                      disabled={p.disabled}
                      inputMode="numeric"
                      maxLength={2}
                      autoComplete="off"
                      title={err ?? `${letter}: ${RANGES[letter].join('–')}`}
                      aria-label={`${letter} fila ${r + 1}`}
                      onFocus={(e) => { lastFocus.current = e.currentTarget; }}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                        setCell(c, r, v);
                        if (complete(c, v)) go(idx(c, r) + 1);
                      }}
                      onKeyDown={(e) => {
                        const i = idx(c, r);
                        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); setReviewed((s) => new Set(s).add(k)); go(i + 1); }
                        else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); go(i - 1); }
                        else if (e.key === 'Backspace' && t === '') { e.preventDefault(); go(i - 1); }
                        else if (e.key.startsWith('Arrow')) {
                          e.preventDefault();
                          let cc = c; let rr = r;
                          for (let n = 0; n < 2; n++) {
                            if (e.key === 'ArrowDown') rr = Math.min(4, rr + 1);
                            if (e.key === 'ArrowUp') rr = Math.max(0, rr - 1);
                            if (e.key === 'ArrowRight') cc = Math.min(4, cc + 1);
                            if (e.key === 'ArrowLeft') cc = Math.max(0, cc - 1);
                            const el = cellRefs.current[key(cc, rr)];
                            if (el) { el.focus(); el.select(); break; }
                          }
                        }
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ce-errors" role="status">{check.ok && p.value.folio.trim() ? '' : [!p.value.folio.trim() ? 'Falta el folio' : '', ...check.errors].filter(Boolean).join(' · ')}</div>
    </div>
  );
});

export function draftIsValid(d: CardDraft): boolean {
  return !!d.folio.trim() && validateGrid(draftGrid(d)).ok;
}
