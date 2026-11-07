import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { label, parseInput } from '../../shared/bingo/numbers';
import type { CallView, OperatorState } from '../../shared/ipc/contract';
import { describe } from '../../shared/patterns/patterns';
import { call, toast } from '../ui/api';
import { Board } from '../ui/Board';
import { PatternPreview } from '../ui/PatternPreview';
import { BingoDialog } from './BingoDialog';
import type { Tab } from './OperatorApp';

type Feedback = { kind: 'ok' | 'error' | 'info'; text: string } | null;

export function GamePanel({ state, goTo }: { state: OperatorState; goTo: (t: Tab) => void }) {
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState<CallView | null>(null);
  const [confirmNext, setConfirmNext] = useState(false);
  const [bingo, setBingo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const called = useMemo(() => new Set(state.calls.map((c) => c.number)), [state.calls]);
  const focusInput = useCallback(() => requestAnimationFrame(() => inputRef.current?.focus()), []);
  const cur = state.current;
  const gameWinners = state.winners.filter((w) => w.gameId === cur?.game.id);
  const isLast = !!cur && cur.index === cur.total;

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), feedback.kind === 'error' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  async function submit(): Promise<void> {
    if (busy) return;
    const p = parseInput(input);
    if (!p.ok) { setFeedback({ kind: 'error', text: p.error }); inputRef.current?.select(); return; }
    setBusy(true);
    try {
      const r = await window.bingo.invoke('calls:add', p.number);
      if (r.ok) { setFeedback({ kind: 'ok', text: `${label(r.call.number)} — número ${r.call.seq}` }); setInput(''); }
      else { setFeedback({ kind: 'error', text: r.error }); inputRef.current?.select(); }
    } finally { setBusy(false); focusInput(); }
  }

  function askUndo(): void {
    if (!state.last) { setFeedback({ kind: 'info', text: 'No hay números para deshacer' }); return; }
    setConfirmUndo(state.last);
  }

  async function doUndo(): Promise<void> {
    setConfirmUndo(null);
    const r = await window.bingo.invoke('calls:undo');
    setFeedback(r.ok ? { kind: 'info', text: `Se deshizo ${label(r.undone.number)}` } : { kind: 'error', text: r.error });
    focusInput();
  }

  async function doNext(): Promise<void> {
    setConfirmNext(false);
    if (await call('games:next')) toast('ok', 'Siguiente juego');
    focusInput();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
    else if (e.key === 'Escape') setInput('');
    else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); askUndo(); }
    else if (e.key === '-' && e.currentTarget.value === '') { e.preventDefault(); askUndo(); }
    else if (e.key === '*' || e.key === 'F2') { e.preventDefault(); setBingo(true); }
  }

  function pick(n: number): void {
    if (called.has(n)) { setFeedback({ kind: 'error', text: `${label(n)} ya salió` }); focusInput(); return; }
    setInput(String(n));
    setFeedback({ kind: 'info', text: `${label(n)} seleccionado: pulse Enter para cantarlo` });
    focusInput();
  }

  return (
    <div className="game">
      <section className="op-left">
        <label className="op-input-label" htmlFor="num">Número cantado</label>
        <div className="op-input-row">
          <input id="num" ref={inputRef} className="op-input" value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^0-9bingoBINGO-]/g, '').slice(0, 5))}
            onKeyDown={onKeyDown} inputMode="numeric" autoComplete="off" autoFocus placeholder="Nº"
            aria-describedby="fb" disabled={!state.event} />
          <button className="primary" onClick={() => void submit()} disabled={busy || !state.event}>Cantar ↵</button>
        </div>
        <div id="fb" className={'feedback ' + (feedback?.kind ?? '')} role="status" aria-live="assertive">{feedback?.text ?? ' '}</div>

        <div className="op-last">
          {state.last ? (
            <div className={`op-last-ball l-${state.last.letter}`}><span>{state.last.letter}</span><strong>{state.last.number}</strong></div>
          ) : <div className="op-last-ball empty">—</div>}
          <div className="op-recent">
            {state.lastFive.slice(1).map((c) => <span key={c.id} className={`chip l-${c.letter}`}>{c.letter}-{c.number}</span>)}
          </div>
          <div className="op-count"><strong>{state.count}</strong> de 75 cantados</div>
        </div>

        <button className="bingo-btn" onClick={() => setBingo(true)} disabled={!cur}>¡BINGO! <small>(F2 o *)</small></button>
        <button className="danger" onClick={askUndo} disabled={!state.last}>Deshacer último (Ctrl+Z o “−”)</button>
      </section>

      <section className="op-center">
        <Board called={called} last={state.last?.number ?? null} onPick={pick} />
        <p className="muted small">Clic en un número para seleccionarlo; Enter para cantarlo.</p>
      </section>

      <aside className="op-right">
        {cur ? (
          <>
            <div className="muted small">Juego {cur.index} de {cur.total}</div>
            <h2 className="game-title">{cur.game.name}: {cur.pattern.name}</h2>
            <PatternPreview def={cur.pattern.def} size="md" />
            <div className="muted small">{describe(cur.pattern.def)}</div>
            <div className="near" title="Solo visible para el operador">
              <div><strong>{state.near?.complete ?? 0}</strong><span>completan la figura</span></div>
              <div><strong>{state.near?.oneAway ?? 0}</strong><span>a 1 número</span></div>
            </div>
            <div className="muted small">Sobre {state.cards.own + state.cards.external} cartones registrados (solo operador).</div>
            {gameWinners.length > 0 && (
              <div className="winners-box">
                <strong>Ganadores de este juego</strong>
                {gameWinners.map((w) => (
                  <div key={w.id} className="winner-row">
                    {w.series}-{w.folio} <span className="muted small">({w.callsCount} números{w.note ? ` · ${w.note}` : ''})</span>
                  </div>
                ))}
                {gameWinners.length > 1 && <div className="muted small">Hay empate: use "Desempate" en el diálogo ¡BINGO!.</div>}
              </div>
            )}
            {state.overlay ? (
              <button onClick={() => void call('overlay:hide')}>Quitar ¡BINGO! de la pantalla pública</button>
            ) : null}
            <button onClick={() => (gameWinners.length ? void doNext() : setConfirmNext(true))} disabled={isLast}>
              Siguiente juego →
            </button>
            {isLast && <div className="muted small">Es el último juego de la secuencia.</div>}
          </>
        ) : (
          <div className="empty-box">
            <p>No hay juegos en la secuencia.</p>
            <button onClick={() => goTo('eventos')}>Configurar juegos</button>
          </div>
        )}
      </aside>

      {confirmUndo && (
        <Confirm title="¿Deshacer el último número?"
          text={`Se quitará ${label(confirmUndo.number)} (número ${confirmUndo.seq}) del tablero y de la pantalla pública.`}
          confirmText={`Deshacer ${label(confirmUndo.number)}`}
          onConfirm={() => void doUndo()} onCancel={() => { setConfirmUndo(null); focusInput(); }} />
      )}
      {confirmNext && (
        <Confirm title="¿Pasar al siguiente juego sin ganador?"
          text="Este juego no tiene ganadores registrados."
          confirmText="Pasar al siguiente"
          onConfirm={() => void doNext()} onCancel={() => { setConfirmNext(false); focusInput(); }} />
      )}
      {bingo && <BingoDialog state={state} onClose={() => { setBingo(false); focusInput(); }} />}
    </div>
  );
}

export function Confirm(p: { title: string; text: string; confirmText: string; onConfirm: () => void; onCancel: () => void }) {
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
