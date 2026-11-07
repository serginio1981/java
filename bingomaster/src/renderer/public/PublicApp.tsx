import { useMemo } from 'react';
import type { PublicState } from '../../shared/ipc/contract';
import { Board } from '../ui/Board';
import { PatternPreview } from '../ui/PatternPreview';
import { useAppState } from '../ui/useAppState';

/** Pantalla del proyector, diseñada para 1920×1080 y escalada al tamaño real. */
export function PublicApp() {
  const state = useAppState<PublicState>();
  const called = useMemo(() => new Set(state?.calls.map((c) => c.number) ?? []), [state?.calls]);
  if (!state) return <div className="pub" />;
  const cur = state.current;

  return (
    <div className="pub">
      <header className="pub-header">
        <div className="pub-event">{state.event?.name ?? ''}</div>
        <div className="pub-game">{cur ? `Juego ${cur.index} de ${cur.total} — ${cur.pattern.name}` : ''}</div>
        <div className="pub-count"><strong>{state.count}</strong> números</div>
      </header>

      <section className="pub-last">
        {state.last ? (
          // key fuerza a React a recrear el nodo y repetir la animación de entrada.
          <div key={state.last.id} className={`pub-ball l-${state.last.letter}`}>
            <span>{state.last.letter}</span>
            <strong>{state.last.number}</strong>
          </div>
        ) : (
          <div className="pub-ball empty">¡A jugar!</div>
        )}
        <div className="pub-recent">
          <div className="pub-recent-title">Anteriores</div>
          <div className="pub-recent-list">
            {state.lastFive.slice(1).map((c) => (
              <div key={c.id} className={`pub-mini l-${c.letter}`}><span>{c.letter}</span>{c.number}</div>
            ))}
          </div>
        </div>
        {cur && (
          <div className="pub-figure">
            <div className="pub-figure-title">Figura</div>
            <PatternPreview def={cur.pattern.def} size="xl" interval={1600} />
          </div>
        )}
      </section>

      <section className="pub-board">
        <Board called={called} last={state.last?.number ?? null} />
      </section>

      {state.overlay && (
        <div className="pub-overlay" role="alert">
          <div className="pub-overlay-box">
            <div className="pub-overlay-title">¡BINGO!</div>
            <div className="pub-overlay-game">{state.overlay.gameName}</div>
            <div className="pub-overlay-id">
              {state.overlay.series && <span>Serie <b>{state.overlay.series}</b></span>}
              <span>Folio <b>{state.overlay.folio}</b></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
