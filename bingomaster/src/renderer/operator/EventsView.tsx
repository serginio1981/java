import { useEffect, useState } from 'react';
import type { GameView, OperatorState } from '../../shared/ipc/contract';
import { call, toast } from '../ui/api';
import { Modal } from '../ui/Modal';

const today = (): string => new Date().toISOString().slice(0, 10);

export function EventsView({ state }: { state: OperatorState }) {
  const [creating, setCreating] = useState(false);
  const ev = state.event;
  return (
    <div className="page-2col">
      <section className="panel">
        <div className="panel-head">
          <h2>Eventos</h2>
          <button className="primary" onClick={() => setCreating(true)}>Nuevo evento</button>
        </div>
        <table className="list">
          <thead><tr><th>Evento</th><th>Fecha</th><th>Serie</th><th>Números</th><th></th></tr></thead>
          <tbody>
            {state.events.map((e) => (
              <tr key={e.id} className={e.id === ev?.id ? 'current' : ''}>
                <td>{e.name}</td><td>{e.date}</td><td>{e.seriesCode}</td>
                <td>{e.accumulateCalls ? 'acumulan' : 'por juego'}</td>
                <td>{e.id === ev?.id ? <strong>Activo</strong> : <button onClick={() => void call('events:activate', e.id)}>Activar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ev && <EditEvent key={ev.id} state={state} />}
      </section>
      <section className="panel">
        <GamesEditor state={state} />
      </section>
      {creating && <CreateEvent onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateEvent({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [series, setSeries] = useState('');
  const [acc, setAcc] = useState(true);
  async function save(): Promise<void> {
    const r = await call('events:create', { name, date, seriesCode: series, accumulateCalls: acc });
    if (r) { toast('ok', `Evento "${r.event.name}" creado y activado`); onClose(); }
  }
  return (
    <Modal title="Nuevo evento" onClose={onClose}>
      <div className="form">
        <label>Nombre <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} /></label>
        <label>Fecha <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Código de serie <input value={series} onChange={(e) => setSeries(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} placeholder="NOV26" /></label>
        <small className="muted">Los cartones propios se numeran {series || 'SERIE'}-0001, {series || 'SERIE'}-0002…</small>
        <label className="chk"><input type="checkbox" checked={acc} onChange={(e) => setAcc(e.target.checked)} /> Los números cantados se acumulan durante todo el evento</label>
        <small className="muted">Si lo desmarca, cada juego empieza con el tablero vacío. Se carga una secuencia de juegos inicial que puede editar.</small>
        <div className="row"><button className="primary" onClick={() => void save()} disabled={!name.trim() || !series}>Crear y activar</button><button onClick={onClose}>Cancelar</button></div>
      </div>
    </Modal>
  );
}

function EditEvent({ state }: { state: OperatorState }) {
  const ev = state.event!;
  const [name, setName] = useState(ev.name);
  const [date, setDate] = useState(ev.date);
  const [acc, setAcc] = useState(ev.accumulateCalls);
  const dirty = name !== ev.name || date !== ev.date || acc !== ev.accumulateCalls;
  return (
    <div className="form edit-event">
      <h3>Evento activo</h3>
      <label>Nombre <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>
      <label>Fecha <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Serie <input value={ev.seriesCode} disabled /></label>
      <label className="chk"><input type="checkbox" checked={acc} onChange={(e) => setAcc(e.target.checked)} disabled={state.count > 0} /> Números acumulados en todo el evento</label>
      {state.count > 0 && <small className="muted">El modo no se puede cambiar con números ya cantados.</small>}
      <div className="row"><button className="primary" disabled={!dirty} onClick={async () => { if (await call('events:update', ev.id, { name, date, accumulateCalls: acc })) toast('ok', 'Evento actualizado'); }}>Guardar cambios</button></div>
    </div>
  );
}

function GamesEditor({ state }: { state: OperatorState }) {
  const [patternId, setPatternId] = useState<number>(state.patterns[0]?.id ?? 0);
  const [edit, setEdit] = useState<GameView | null>(null);
  const curId = state.current?.game.id;
  const winnersBy = (gid: number) => state.winners.filter((w) => w.gameId === gid);
  return (
    <>
      <div className="panel-head"><h2>Secuencia de juegos</h2></div>
      <ol className="games">
        {state.games.map((g, i) => (
          <li key={g.id} className={g.id === curId ? 'current' : ''}>
            <span className="g-pos">{i + 1}</span>
            <span className="g-name">{g.name}<small className="muted"> · {g.patternName}</small></span>
            {winnersBy(g.id).length > 0 && <span className="badge">{winnersBy(g.id).length} ganador(es)</span>}
            <span className="g-actions">
              {g.id === curId ? <strong>En juego</strong> : <button onClick={() => void call('games:setCurrent', g.id)} title="Jugar este juego ahora">Jugar</button>}
              <button onClick={() => void call('games:move', g.id, -1)} disabled={i === 0} aria-label="Subir">↑</button>
              <button onClick={() => void call('games:move', g.id, 1)} disabled={i === state.games.length - 1} aria-label="Bajar">↓</button>
              <button onClick={() => setEdit(g)}>Editar</button>
              <button className="danger" onClick={() => void call('games:remove', g.id)}>Quitar</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="row add-game">
        <select value={patternId} onChange={(e) => setPatternId(Number(e.target.value))} aria-label="Figura">
          {state.patterns.map((p) => <option key={p.id} value={p.id}>{p.name}{p.isBuiltin ? '' : ' (personalizada)'}</option>)}
        </select>
        <button className="primary" onClick={() => void call('games:add', { name: `Juego ${state.games.length + 1}`, patternId })}>Agregar juego</button>
      </div>
      {edit && <EditGame state={state} game={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditGame({ state, game, onClose }: { state: OperatorState; game: GameView; onClose: () => void }) {
  const [name, setName] = useState(game.name);
  const [pid, setPid] = useState(game.patternId);
  useEffect(() => { setName(game.name); setPid(game.patternId); }, [game]);
  return (
    <Modal title="Editar juego" onClose={onClose}>
      <div className="form">
        <label>Nombre <input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label>Figura
          <select value={pid} onChange={(e) => setPid(Number(e.target.value))}>
            {state.patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="row"><button className="primary" onClick={async () => { if (await call('games:update', game.id, { name, patternId: pid })) onClose(); }}>Guardar</button><button onClick={onClose}>Cancelar</button></div>
      </div>
    </Modal>
  );
}
