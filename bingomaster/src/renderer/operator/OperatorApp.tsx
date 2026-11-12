import { useEffect, useState } from 'react';
import type { OperatorState } from '../../shared/ipc/contract';
import { call, onToast, type Toast } from '../ui/api';
import { useAppState } from '../ui/useAppState';
import { CardsView } from './CardsView';
import { DonateDialog } from './DonateDialog';
import { EventsView } from './EventsView';
import { GamePanel } from './GamePanel';
import { ImportView } from './ImportView';
import { PatternsView } from './PatternsView';
import { SettingsView } from './SettingsView';

const TABS = [
  ['juego', 'Juego'],
  ['eventos', 'Evento y juegos'],
  ['cartones', 'Cartones'],
  ['figuras', 'Figuras'],
  ['importar', 'Importar con IA'],
  ['ajustes', 'Ajustes'],
] as const;
export type Tab = (typeof TABS)[number][0];

export function OperatorApp() {
  const state = useAppState<OperatorState>();
  const [tab, setTab] = useState<Tab>('juego');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [donate, setDonate] = useState(false);

  useEffect(() => onToast((t) => {
    setToasts((x) => [...x.slice(-3), t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), t.kind === 'error' ? 7000 : 4000);
  }), []);

  if (!state) return <div className="op-loading">Cargando…</div>;

  return (
    <div className="op">
      <header className="op-header">
        <div className="op-title">
          <h1>{state.event?.name ?? 'Sin evento'}</h1>
          <div className="muted small">
            {state.event ? `${state.event.date} · Serie ${state.event.seriesCode} · ${state.cards.own + state.cards.external} cartones` : ''}
          </div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <PublicControls state={state} />
        <button className="donate-btn" onClick={() => setDonate(true)} title="Apoyar Bingo Master con una donación voluntaria (PayPal)" aria-label="Apoyar Bingo Master (donar)">♥</button>
        <button className="help-btn" onClick={() => void call('help:openManual', null)} title="Manual de usuario (F1)">? Manual</button>
      </header>
      {donate && <DonateDialog onClose={() => setDonate(false)} />}

      {state.notice && (
        <div className="notice" role="status">
          {state.notice}
        </div>
      )}

      <main className="op-body">
        {tab === 'juego' && <GamePanel state={state} goTo={setTab} />}
        {tab === 'eventos' && <EventsView state={state} />}
        {tab === 'cartones' && <CardsView state={state} />}
        {tab === 'figuras' && <PatternsView state={state} />}
        {tab === 'importar' && <ImportView state={state} goTo={setTab} />}
        {tab === 'ajustes' && <SettingsView state={state} />}
      </main>

      <footer className="op-footer muted small">
        Datos: {state.dataPath} · Pantalla pública: {state.publicWindow.open ? 'abierta' : 'cerrada'}
      </footer>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

function PublicControls({ state }: { state: OperatorState }) {
  const external = state.displays.find((d) => !d.primary);
  const [displayId, setDisplayId] = useState<number | null>(null);
  const selected = displayId ?? state.publicWindow.displayId ?? external?.id ?? state.displays[0]?.id ?? null;
  const pw = state.publicWindow;
  return (
    <div className="pub-controls">
      <select aria-label="Pantalla pública" value={selected ?? ''} onChange={(e) => setDisplayId(Number(e.target.value))}>
        {state.displays.map((d) => <option key={d.id} value={d.id}>{d.label}{!d.primary ? ' — proyector' : ''}</option>)}
      </select>
      <button onClick={() => void call('public:open', selected)}>{pw.open ? 'Mover pública' : 'Abrir pública'}</button>
      {pw.open && (
        <>
          <button onClick={() => void call('public:toggleFullscreen')}>{pw.fullscreen ? 'Ventana' : 'Pantalla completa'}</button>
          <button className="danger" onClick={() => void call('public:close')}>Cerrar</button>
        </>
      )}
    </div>
  );
}
