import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardView, OperatorState, PrintOptions } from '../../shared/ipc/contract';
import { call, toast } from '../ui/api';
import { CardEditor, draftFrom, draftGrid, draftIsValid, type CardEditorHandle } from '../ui/CardEditor';
import { CardGrid } from '../ui/CardGrid';
import { Keypad, Modal } from '../ui/Modal';

const PAGE = 50;

export function CardsView({ state }: { state: OperatorState }) {
  const [mode, setMode] = useState<'list' | 'manual'>('list');
  return (
    <div className="cards-view">
      <div className="subtabs">
        <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>Cartones propios e impresión</button>
        <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Ingreso manual de cartón externo</button>
      </div>
      {mode === 'list' ? <OwnCards state={state} /> : <ManualEntry state={state} />}
    </div>
  );
}

function OwnCards({ state }: { state: OperatorState }) {
  const [n, setN] = useState('100');
  const [busy, setBusy] = useState(false);
  const [print, setPrint] = useState<PrintOptions>({ paper: 'Letter', perPage: 4 });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [list, setList] = useState<{ total: number; items: CardView[] }>({ total: 0, items: [] });
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<CardView | null>(null);
  const series = state.event?.seriesCode ?? '';
  const total = state.cards.own + state.cards.external;

  const load = useCallback(async () => {
    const r = await call('cards:list', { offset, limit: PAGE, search });
    if (r) setList(r);
  }, [offset, search]);
  useEffect(() => { void load(); }, [load, total]);

  async function generate(): Promise<void> {
    const count = parseInt(n, 10);
    setBusy(true);
    const r = await call('cards:generate', count);
    setBusy(false);
    if (r) toast('ok', `Se generaron ${r.created} cartones: ${r.first} a ${r.last}`);
  }

  async function exportPdf(): Promise<void> {
    const opts: PrintOptions = { ...print, from: from ? parseInt(from, 10) : undefined, to: to ? parseInt(to, 10) : undefined };
    setBusy(true);
    toast('info', 'Generando PDF…');
    const r = await call('cards:exportPdf', opts);
    setBusy(false);
    if (r) toast('ok', `PDF guardado (${r.count} cartones): ${r.path}`);
  }

  return (
    <div className="page-2col">
      <section className="panel">
        <h2>Generar cartones propios</h2>
        <p className="muted">Hay {state.cards.own} propios y {state.cards.external} externos. El próximo folio es <b>{series}-{String(state.cards.nextOwnFolio).padStart(4, '0')}</b>.</p>
        <div className="row left">
          <input type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} aria-label="Cantidad" className="num-in" />
          <button className="primary" onClick={() => void generate()} disabled={busy || !(parseInt(n, 10) > 0)}>Generar</button>
        </div>
        <small className="muted">Aleatorios, sin repetir layout dentro del evento. La numeración continúa si genera más después.</small>

        <h2>Imprimir / exportar PDF</h2>
        <div className="form">
          <label>Papel
            <select value={print.paper} onChange={(e) => setPrint({ ...print, paper: e.target.value as PrintOptions['paper'] })}>
              <option value="Letter">Carta</option><option value="A4">A4</option>
            </select>
          </label>
          <label>Cartones por hoja
            <select value={print.perPage} onChange={(e) => setPrint({ ...print, perPage: Number(e.target.value) as PrintOptions['perPage'] })}>
              <option value={1}>1</option><option value={2}>2</option><option value={4}>4</option>
            </select>
          </label>
          <label>Folios desde <input type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1" className="num-in" /></label>
          <label>hasta <input type="number" min={1} value={to} onChange={(e) => setTo(e.target.value)} placeholder={String(Math.max(1, state.cards.nextOwnFolio - 1))} className="num-in" /></label>
          <small className="muted">Vacío = todos los propios. Para reimprimir, indique el rango.</small>
          <div className="row left"><button className="primary" onClick={() => void exportPdf()} disabled={busy || state.cards.own === 0}>Exportar PDF…</button></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Cartones del evento ({list.total})</h2>
          <input placeholder="Buscar folio" value={search} onChange={(e) => { setOffset(0); setSearch(e.target.value); }} aria-label="Buscar folio" />
        </div>
        <table className="list">
          <thead><tr><th>Serie</th><th>Folio</th><th>Origen</th><th></th></tr></thead>
          <tbody>
            {list.items.map((c) => (
              <tr key={c.id}>
                <td>{c.series || '—'}</td><td>{c.folio}</td><td>{c.origin === 'own' ? 'propio' : 'externo'}</td>
                <td><button onClick={() => setView(c)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Anteriores</button>
          <span className="muted small">{list.total ? `${offset + 1}–${Math.min(offset + PAGE, list.total)} de ${list.total}` : ''}</span>
          <button disabled={offset + PAGE >= list.total} onClick={() => setOffset(offset + PAGE)}>Siguientes →</button>
        </div>
      </section>
      {view && <CardModal card={view} onClose={() => setView(null)} />}
    </div>
  );
}

function CardModal({ card, onClose }: { card: CardView; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => { if (card.hasImage) void call('cards:image', card.id).then((r) => r && setImg(r.dataUrl)); }, [card]);
  return (
    <Modal title={`${card.series || '(sin serie)'} · Folio ${card.folio}`} onClose={onClose} wide={!!img}>
      <div className="row left top">
        <CardGrid grid={card.grid} size="lg" />
        {img && <img src={img} alt="Foto de origen" className="card-photo" />}
      </div>
      <p className="muted small">{card.origin === 'own' ? 'Cartón propio' : 'Cartón externo'} · registrado {new Date(card.createdAt).toLocaleString()}</p>
    </Modal>
  );
}

/** Ingreso manual de cartón externo (también es el respaldo sin internet o sin API key). */
export function ManualEntry({ state }: { state: OperatorState }) {
  const [draft, setDraft] = useState(draftFrom('', '', null));
  const [keepSeries, setKeepSeries] = useState(true);
  const [dup, setDup] = useState<CardView | null>(null);
  const ed = useRef<CardEditorHandle>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  useEffect(() => ed.current?.focusFirst(), []);
  useEffect(() => setDup(null), [draft.series, draft.folio]);

  async function save(): Promise<void> {
    if (!draftIsValid(draft)) { toast('error', 'Complete el folio y los 24 números válidos'); return; }
    const exists = await call('cards:exists', draft.series, draft.folio);
    if (exists) { setDup(exists); return; }
    const r = await call('cards:addExternal', { series: draft.series, folio: draft.folio, grid: draftGrid(draft), confirmed: true });
    if (r) {
      toast('ok', `Cartón externo guardado: ${r.card.series} ${r.card.folio}`);
      const next = draftFrom(keepSeries ? draft.series : '', '', null);
      setDraft(next);
      requestAnimationFrame(() => (keepSeries && next.series ? ed.current?.focusFolio() : ed.current?.focusFirst()));
    }
  }

  return (
    <div className="manual" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void save(); } }}>
      <section className="panel">
        <h2>Cartón externo — ingreso manual</h2>
        <p className="muted small">Serie, Enter, folio, Enter y los 24 números. El cursor avanza solo. Ctrl+Enter guarda. Evento: <b>{state.event?.name}</b>.</p>
        <CardEditor ref={ed} value={draft} onChange={setDraft} onDone={() => saveRef.current?.focus()} />
        <label className="chk"><input type="checkbox" checked={keepSeries} onChange={(e) => setKeepSeries(e.target.checked)} /> Mantener la serie para el siguiente cartón</label>
        {dup && <div className="feedback error">Ya existe en el evento un cartón con serie "{dup.series}" y folio "{dup.folio}". Revise los datos: no se puede repetir.</div>}
        <div className="row left">
          <button ref={saveRef} className="primary" onClick={() => void save()} disabled={!draftIsValid(draft)}>Confirmar y guardar</button>
          <button onClick={() => { setDraft(draftFrom('', '', null)); ed.current?.focusFirst(); }}>Limpiar</button>
        </div>
      </section>
      <Keypad onKey={(k) => ed.current?.press(k)} />
    </div>
  );
}
