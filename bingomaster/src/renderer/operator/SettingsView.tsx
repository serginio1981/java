import { useEffect, useState } from 'react';
import type { OperatorState } from '../../shared/ipc/contract';
import { call, toast } from '../ui/api';

export function SettingsView({ state }: { state: OperatorState }) {
  const s = state.settings;
  const [key, setKey] = useState('');
  const [model, setModel] = useState(s.model);
  useEffect(() => setModel(s.model), [s.model]);
  let enc = s.encryptionAvailable ? 'Cifrado del sistema disponible.' : 'Este equipo no ofrece cifrado seguro: no se puede guardar la API key.';
  if (s.encryptionBackend === 'basic_text') enc += ' Atención: no hay llavero del sistema (backend basic_text); el cifrado es débil.';
  return (
    <div className="page-2col">
      <section className="panel form">
        <h2>Importación con IA (único módulo con internet)</h2>
        <p>{s.apiKeyConfigured ? '✓ API key configurada (cifrada).' : 'Sin API key: solo ingreso manual.'}</p>
        <p className="muted small">{enc}</p>
        <label>API key de Anthropic
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} />
        </label>
        <div className="row left">
          <button className="primary" disabled={!key.trim()} onClick={async () => { if (await call('settings:setApiKey', key)) toast('ok', 'API key guardada cifrada'); setKey(''); }}>Guardar cifrada</button>
          <button className="danger" disabled={!s.apiKeyConfigured} onClick={() => void call('settings:clearApiKey')}>Borrar API key</button>
        </div>
        <label>Modelo (identificador)
          <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => model !== s.model && void call('settings:update', { model })} spellCheck={false} />
        </label>
        <small className="muted">Debe ser un modelo con visión y salidas estructuradas. Por defecto claude-opus-5-5. Verifique los identificadores vigentes en docs.claude.com.</small>
        <label className="chk"><input type="checkbox" checked={s.doubleRead} onChange={(e) => void call('settings:update', { doubleRead: e.target.checked })} /> Doble lectura (dos llamadas independientes; duplica el costo por foto)</label>
      </section>
      <section className="panel form">
        <h2>Carpeta compartida con el celular</h2>
        <p className="muted small">Las fotos que lleguen a esta carpeta (por ejemplo, sincronizada con OneDrive o Google Drive desde el celular) aparecen en "Importar con IA".</p>
        <p>{s.importFolder || 'Sin carpeta'}</p>
        <div className="row left">
          <button onClick={() => void call('import:chooseFolder')}>Elegir carpeta…</button>
          <button disabled={!s.importFolder} onClick={() => void call('import:clearFolder')}>Quitar</button>
        </div>
        <h2>Datos</h2>
        <p className="muted small">Base de datos: {state.dataPath}. Se guarda automáticamente tras cada acción.</p>
      </section>
    </div>
  );
}
