import { useMemo } from 'react';
import type { PublicState } from '../../shared/ipc/contract';
import { Board } from '../ui/Board';
import { useAppState } from '../ui/useAppState';

/** Pantalla del proyector, diseñada para 1920×1080 y escalada al tamaño real. */
export function PublicApp() {
  const state = useAppState<PublicState>();
  const called = useMemo(() => new Set(state?.calls.map((c) => c.number) ?? []), [state?.calls]);
  if (!state) return <div className="pub" />;

  return (
    <div className="pub">
      <header className="pub-header">
        <div className="pub-event">{state.event?.name ?? ''}</div>
        <div className="pub-game">{/* F3: "Juego 3 de 7 — Figura X" */}</div>
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
              <div key={c.id} className={`pub-mini l-${c.letter}`}>
                <span>{c.letter}</span>{c.number}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-board">
        <Board called={called} last={state.last?.number ?? null} />
      </section>
    </div>
  );
}
