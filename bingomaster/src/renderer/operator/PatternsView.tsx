import { useState } from 'react';
import type { OperatorState } from '../../shared/ipc/contract';
import { describe, type PatternDef, type PatternView } from '../../shared/patterns/patterns';
import { call, toast } from '../ui/api';
import { MaskGrid } from '../ui/MaskGrid';
import { Modal } from '../ui/Modal';
import { PatternPreview } from '../ui/PatternPreview';

const EMPTY_MASK = '0'.repeat(25);

export function PatternsView({ state }: { state: OperatorState }) {
  const [editing, setEditing] = useState<{ id: number | null; name: string; def: PatternDef } | null>(null);
  const used = (id: number) => state.games.some((g) => g.patternId === id);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Figuras</h2>
        <button className="primary" onClick={() => setEditing({ id: null, name: '', def: { type: 'mask', mask: EMPTY_MASK } })}>Nueva figura</button>
      </div>
      <p className="muted small">Las figuras personalizadas se guardan para reutilizarlas en otros eventos. Las precargadas no se editan, pero puede copiarlas.</p>
      <div className="pattern-list">
        {state.patterns.map((p) => (
          <div key={p.id} className="pattern-card">
            <PatternPreview def={p.def} size="sm" interval={1200} />
            <div className="pc-name">{p.name}</div>
            <div className="muted small">{describe(p.def)}{p.isBuiltin ? ' · precargada' : ''}</div>
            <div className="row">
              {!p.isBuiltin && <button onClick={() => setEditing({ id: p.id, name: p.name, def: p.def })}>Editar</button>}
              <button onClick={() => setEditing({ id: null, name: `${p.name} (copia)`, def: p.def })}>Copiar</button>
              {!p.isBuiltin && (
                <button className="danger" disabled={used(p.id)} title={used(p.id) ? 'Se usa en un juego de este evento' : ''}
                  onClick={async () => { if (await call('patterns:remove', p.id)) toast('ok', 'Figura borrada'); }}>Borrar</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && <PatternEditor state={state} initial={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function PatternEditor({ state, initial, onClose }: {
  state: OperatorState;
  initial: { id: number | null; name: string; def: PatternDef };
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<PatternDef['type']>(initial.def.type);
  const [mask, setMask] = useState(initial.def.type === 'mask' ? initial.def.mask : EMPTY_MASK);
  const [group, setGroup] = useState<string[]>(initial.def.type === 'group' ? initial.def.masks : []);
  const [n, setN] = useState(initial.def.type === 'count' ? initial.def.n : 3);
  const [free, setFree] = useState(initial.def.type === 'count' ? initial.def.freeCounts : false);
  const maskPatterns: PatternView[] = state.patterns.filter((p) => p.def.type === 'mask');

  const def: PatternDef = type === 'mask' ? { type, mask }
    : type === 'group' ? { type, masks: group, labels: group.map((m) => maskPatterns.find((p) => p.def.type === 'mask' && p.def.mask === m)?.name ?? '') }
      : { type, n, freeCounts: free };

  async function save(): Promise<void> {
    const r = initial.id === null
      ? await call('patterns:create', { name, def })
      : await call('patterns:update', initial.id, { name, def });
    if (r) { toast('ok', 'Figura guardada'); onClose(); }
  }

  return (
    <Modal title={initial.id === null ? 'Nueva figura' : 'Editar figura'} onClose={onClose} wide>
      <div className="pattern-editor">
        <div className="form">
          <label>Nombre <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} /></label>
          <fieldset className="radios">
            <legend>Tipo</legend>
            <label><input type="radio" checked={type === 'mask'} onChange={() => setType('mask')} /> Máscara fija</label>
            <label><input type="radio" checked={type === 'group'} onChange={() => setType('group')} /> Cualquiera de varias</label>
            <label><input type="radio" checked={type === 'count'} onChange={() => setType('count')} /> Primeros N números</label>
          </fieldset>
          {type === 'mask' && (
            <>
              <p className="muted small">Clic en las celdas que forman la figura. El centro (FREE) siempre está marcado.</p>
              <MaskGrid size="lg" showHeader mask={mask} onToggle={(i) => {
                if (i === 12) return;
                setMask(mask.slice(0, i) + (mask[i] === '1' ? '0' : '1') + mask.slice(i + 1));
              }} />
              <div className="row left"><button onClick={() => setMask(EMPTY_MASK)}>Limpiar</button><button onClick={() => setMask('1'.repeat(25))}>Todo</button></div>
            </>
          )}
          {type === 'group' && (
            <>
              <p className="muted small">Elija 2 o más máscaras existentes. Gana quien complete cualquiera de ellas.</p>
              <div className="group-pick">
                {maskPatterns.map((p) => {
                  const m = p.def.type === 'mask' ? p.def.mask : '';
                  const on = group.includes(m);
                  return (
                    <label key={p.id} className={'gp' + (on ? ' on' : '')}>
                      <input type="checkbox" checked={on} onChange={() => setGroup(on ? group.filter((x) => x !== m) : [...group, m])} />
                      <MaskGrid mask={m} size="sm" />
                      <span>{p.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {type === 'count' && (
            <>
              <label>N <input type="number" min={1} max={25} value={n} onChange={(e) => setN(parseInt(e.target.value, 10) || 1)} className="num-in" /></label>
              <label className="chk"><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> El FREE cuenta como número</label>
            </>
          )}
        </div>
        <div className="pe-preview">
          <div className="muted small">Vista previa</div>
          <PatternPreview def={def} size="lg" />
        </div>
      </div>
      <div className="row"><button className="primary" onClick={() => void save()} disabled={!name.trim()}>Guardar figura</button><button onClick={onClose}>Cancelar</button></div>
    </Modal>
  );
}
