import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { label, parseInput } from '../../shared/bingo/numbers';
import type { CallView, OperatorState } from '../../shared/ipc/contract';
import { Board } from '../ui/Board';
import { useAppState } from '../ui/useAppState';

type Feedback = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export function OperatorApp() {
  const state = useAppState<OperatorState>();
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState<CallView | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const called = useMemo(() => new Set(state?.calls.map((c) => c.number) ?? []), [state?.calls]);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), feedback.kind === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  async function submit(): Promise<void> {
    if (busy) return;
    const p = parseInput(input);
    if (!p.ok) {
      setFeedback({ kind: 'error', text: p.error });
      inputRef.current?.select();
      return;
    }
    setBusy(true);
    try {
      const r = await window.bingo.invoke('calls:add', p.number);
      if (r.ok) {
        setFeedback({ kind: 'ok', text: `${label(r.call.number)} — número ${r.call.seq}` });
        setInput('');
      } else {
        setFeedback({ kind: 'error', text: r.error });
        inputRef.current?.select();
      }
    } catch (err) {
      setFeedback({ kind: 'error', text: 'Error al registrar: ' + (err as Error).message });
    } finally {
      setBusy(false);
      focusInput();
    }
  }

  function askUndo(): void {
    if (!state?.last) {
      setFeedback({ kind: 'info', text: 'No hay números para deshacer' });
      return;
    }
    setConfirmUndo(state.last);
  }

  async function doUndo(): Promise<void> {
    setConfirmUndo(null);
    const r = await window.bingo.invoke('calls:undo');
    setFeedback(r.ok ? { kind: 'info', text: `Se deshizo ${label(r.undone.number)}` } : { kind: 'error', text: r.error });
    focusInput();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      setInput('');
    } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      askUndo();
    } else if (e.key === '-' && e.currentTarget.value === '') {
      // Tecla "−" del teclado numérico con el campo vacío: deshacer.
      e.preventDefault();
      askUndo();
    }
  }

  function pick(n: number): void {
    if (called.has(n)) {
      setFeedback({ kind: 'error', text: `${label(n)} ya salió` });
      focusInput();
      return;
    }
    setInput(String(n));
    setFeedback({ kind: 'info', text: `${label(n)} seleccionado: pulse Enter para cantarlo` });
    focusInput();
  }

  if (!state) return <div className="op-loading">Cargando…</div>;

  const pw = state.publicWindow;
  return (
    <div className="op">
      <header className="op-header">
        <div>
          <h1>{state.event?.name ?? 'Sin evento'}</h1>
          <div className="muted">
            {state.event ? `${state.event.date} · Serie ${state.event.seriesCode} · ${state.event.accumulateCalls ? 'Números acumulados en todo el evento' : 'Números se reinician por juego'}` : ''}
          </div>
        </div>
        <PublicControls state={state} onDone={focusInput} />
      </header>

      <main className="op-main">
        <section className="op-left">
          <label className="op-input-label" htmlFor="num">Número cantado</label>
          <div className="op-input-row">
            <input
              id="num"
              ref={inputRef}
              className="op-input"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^0-9bingoBINGO-]/g, '').slice(0, 5))}
              onKeyDown={onKeyDown}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="Nº"
              aria-describedby="fb"
              disabled={!state.event}
            />
            <button className="primary" onClick={() => void submit()} disabled={busy || !state.event}>Cantar ↵</button>
          </div>
          <div id="fb" className={'feedback ' + (feedback?.kind ?? '')} role="status" aria-live="assertive">
            {feedback?.text ?? ' '}
          </div>

          <div className="op-last">
            <div className="muted">Último</div>
            {state.last ? (
              <div className={`op-last-ball l-${state.last.letter}`}>
                <span>{state.last.letter}</span>
                <strong>{state.last.number}</strong>
              </div>
            ) : (
              <div className="op-last-ball empty">—</div>
            )}
            <div className="op-recent">
              {state.lastFive.slice(1).map((c) => (
                <span key={c.id} className={`chip l-${c.letter}`}>{c.letter}-{c.number}</span>
              ))}
            </div>
          </div>

          <div className="op-count"><strong>{state.count}</strong> de 75 cantados</div>

          <button className="danger" onClick={askUndo} disabled={!state.last}>
            Deshacer último (Ctrl+Z o “−”)
          </button>

          <div className="op-game muted">
            Juego y figura: se configuran en la fase 3.
          </div>
        </section>

        <section className="op-board">
          <Board called={called} last={state.last?.number ?? null} onPick={pick} />
          <p className="muted small">Clic en un número para seleccionarlo; Enter para cantarlo.</p>
        </section>
      </main>

      <footer className="op-footer muted small">
        Datos: {state.dataPath} · Pantalla pública: {pw.open ? 'abierta' : 'cerrada'}
      </footer>

      {confirmUndo && (
        <ConfirmDialog
          title="¿Deshacer el último número?"
          text={`Se quitará ${label(confirmUndo.number)} (número ${confirmUndo.seq}) del tablero y de la pantalla pública.`}
          confirmText={`Deshacer ${label(confirmUndo.number)}`}
          onConfirm={() => void doUndo()}
          onCancel={() => { setConfirmUndo(null); focusInput(); }}
        />
      )}
    </div>
  );
}

function PublicControls({ state, onDone }: { state: OperatorState; onDone: () => void }) {
  const external = state.displays.find((d) => !d.primary);
  const [displayId, setDisplayId] = useState<number | null>(null);
  const selected = displayId ?? state.publicWindow.displayId ?? external?.id ?? state.displays[0]?.id ?? null;
  const pw = state.publicWindow;

  async function run(p: Promise<unknown>): Promise<void> {
    await p;
    onDone();
  }

  return (
    <div className="pub-controls">
      <label className="muted small" htmlFor="disp">Pantalla pública</label>
      <select id="disp" value={selected ?? ''} onChange={(e) => setDisplayId(Number(e.target.value))}>
        {state.displays.map((d) => (
          <option key={d.id} value={d.id}>{d.label}{!d.primary ? ' — proyector' : ''}</option>
        ))}
      </select>
      <button onClick={() => void run(window.bingo.invoke('public:open', selected))}>
        {pw.open ? 'Mover' : 'Abrir'}
      </button>
      {pw.open && (
        <>
          <button onClick={() => void run(window.bingo.invoke('public:toggleFullscreen'))}>
            {pw.fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>
          <button className="danger" onClick={() => void run(window.bingo.invoke('public:close'))}>Cerrar</button>
        </>
      )}
      {!external && <span className="muted small">No se detecta proyector: se abrirá en ventana.</span>}
    </div>
  );
}

function ConfirmDialog(p: { title: string; text: string; confirmText: string; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div className="modal-backdrop" onKeyDown={(e) => { if (e.key === 'Escape') p.onCancel(); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <h2 id="dlg-t">{p.title}</h2>
        <p>{p.text}</p>
        <div className="row">
          <button className="danger" onClick={p.onConfirm}>{p.confirmText}</button>
          <button ref={cancelRef} onClick={p.onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
