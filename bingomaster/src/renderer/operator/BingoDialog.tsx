/**
 * ¡BINGO!: folio (y serie si hay varias) → cartón con lo cantado marcado y
 * lo que falta resaltado → VÁLIDO / NO VÁLIDO → registrar ganador, mostrar
 * en la pantalla pública, siguiente juego. Incluye ayuda de desempate.
 */
import { useEffect, useRef, useState } from 'react';
import { isValidNumber, label } from '../../shared/bingo/numbers';
import type { CardView, ClaimView, OperatorState } from '../../shared/ipc/contract';
import { call, toast } from '../ui/api';
import { CardGrid } from '../ui/CardGrid';
import { Modal } from '../ui/Modal';

export function BingoDialog({ state, onClose }: { state: OperatorState; onClose: () => void }) {
  const [folio, setFolio] = useState('');
  const [options, setOptions] = useState<CardView[] | null>(null);
  const [claim, setClaim] = useState<ClaimView | null>(null);
  const [registered, setRegistered] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  async function search(): Promise<void> {
    setClaim(null); setOptions(null); setNotFound(false); setRegistered(false);
    const found = await call('cards:find', folio);
    if (!found || found.length === 0) { setNotFound(true); return; }
    if (found.length === 1) await check((found[0] as CardView).id);
    else setOptions(found);
  }

  async function check(cardId: number): Promise<void> {
    const r = await call('claims:check', cardId);
    if (r) { setClaim(r.claim); setOptions(null); setRegistered(r.claim.alreadyWinner); }
  }

  async function register(): Promise<void> {
    if (!claim) return;
    const r = await call('winners:register', claim.card.id);
    if (r) { setRegistered(true); toast('ok', `Ganador registrado: ${claim.card.series}-${claim.card.folio}`); }
  }

  async function showPublic(): Promise<void> {
    if (!claim) return;
    await call('overlay:show', { series: claim.card.series, folio: claim.card.folio, gameName: `${claim.game.name}: ${claim.pattern.name}` });
  }

  const cur = state.current;
  const tied = state.winners.filter((w) => w.gameId === cur?.game.id);

  return (
    <Modal title="¡BINGO! — Validar cartón" onClose={onClose} wide>
      <div className="bingo-search">
        <label>Folio del cartón
          <input ref={ref} value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="ej. 12, 0012 o NOV26-0012"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
        </label>
        <button className="primary" onClick={() => void search()} disabled={!folio.trim()}>Buscar</button>
        {cur && <span className="muted small">Juego {cur.index}: {cur.pattern.name} · {state.count} números cantados</span>}
      </div>

      {notFound && <div className="feedback error">No existe un cartón con folio "{folio}" en este evento.</div>}

      {options && (
        <div className="choose">
          <p>El folio existe en más de una serie. ¿Cuál es?</p>
          {options.map((o) => (
            <button key={o.id} onClick={() => void check(o.id)}>
              Serie <b>{o.series || '(sin serie)'}</b> · folio {o.folio} · {o.origin === 'own' ? 'propio' : 'externo'}
            </button>
          ))}
        </div>
      )}

      {claim && (
        <div className="claim">
          <div>
            <div className="claim-id">
              Serie <b>{claim.card.series || '—'}</b> · Folio <b>{claim.card.folio}</b>
              <span className="muted small"> ({claim.card.origin === 'own' ? 'propio' : 'externo'})</span>
            </div>
            <CardGrid grid={claim.card.grid} marked={claim.marked} target={claim.target} size="lg" />
            <div className="legend small">
              <span className="lg marked">cantado</span>
              <span className="lg missing">falta para la figura</span>
              <span className="lg target">parte de la figura</span>
            </div>
          </div>
          <div className="verdict-col">
            <div className={'verdict ' + (claim.valid ? 'valid' : 'invalid')}>{claim.valid ? 'VÁLIDO' : 'NO VÁLIDO'}</div>
            <p>{claim.reason}</p>
            {claim.alreadyWinner && <p className="muted">Ya está registrado como ganador de este juego.</p>}
            {claim.valid && !registered && <button className="primary big" onClick={() => void register()}>Registrar ganador</button>}
            {registered && (
              <>
                <button className="big" onClick={() => void showPublic()}>Mostrar en pantalla pública</button>
                {state.overlay && <button onClick={() => void call('overlay:hide')}>Quitar de la pantalla pública</button>}
                <button onClick={() => { setClaim(null); setFolio(''); ref.current?.focus(); }}>Validar otro cartón (empate)</button>
                {cur && cur.index < cur.total && (
                  <button onClick={async () => { if (await call('games:next')) { toast('ok', 'Siguiente juego'); onClose(); } }}>
                    Pasar al siguiente juego →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tied.length > 1 && <TieBreak state={state} />}
    </Modal>
  );
}

/**
 * Ayuda de desempate (regla por confirmar con el cliente): se saca otra bola
 * y se muestra cuál de los cartones empatados la tiene. No se registra como
 * número cantado; el operador decide y anota el resultado.
 */
function TieBreak({ state }: { state: OperatorState }) {
  const cur = state.current;
  const tied = state.winners.filter((w) => w.gameId === cur?.game.id);
  const [n, setN] = useState('');
  const [cards, setCards] = useState<Record<number, CardView>>({});
  useEffect(() => {
    void (async () => {
      const out: Record<number, CardView> = {};
      for (const w of tied) {
        const found = await call('cards:find', `${w.series} ${w.folio}`.trim());
        const c = found?.find((x) => x.id === w.cardId);
        if (c) out[w.cardId] = c;
      }
      setCards(out);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tied.map((t) => t.id).join(',')]);
  const num = Number(n);
  const valid = isValidNumber(num);
  const has = (cardId: number): boolean => !!cards[cardId]?.grid.some((col) => col.includes(num));
  const holders = valid ? tied.filter((w) => has(w.cardId)) : [];
  return (
    <div className="tiebreak">
      <h3>Desempate ({tied.length} ganadores en este juego)</h3>
      <p className="muted small">Saque una bola de desempate y escríbala (no se registra como número cantado).</p>
      <input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Nº" className="tb-input" />
      {valid && (
        <>
          <div className="tb-result">
            {holders.length === 1 && <strong>Gana {holders[0]?.series}-{holders[0]?.folio}: tiene {label(num)}.</strong>}
            {holders.length === 0 && <strong>Ningún cartón empatado tiene {label(num)}: saque otra bola.</strong>}
            {holders.length > 1 && <strong>{holders.length} cartones tienen {label(num)}: saque otra bola.</strong>}
          </div>
          {holders.length === 1 && holders[0] && (
            <button onClick={() => void call('winners:note', (holders[0] as { id: number }).id, `Ganó desempate con ${label(num)}`).then((r) => { if (r) toast('ok', 'Desempate anotado'); })}>
              Anotar ganador del desempate
            </button>
          )}
        </>
      )}
    </div>
  );
}
