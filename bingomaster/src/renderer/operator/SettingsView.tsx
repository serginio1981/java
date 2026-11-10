import { useEffect, useState } from 'react';
import type { OperatorState } from '../../shared/ipc/contract';
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '../../shared/import-ai/providers';
import { call, toast } from '../ui/api';

export function SettingsView({ state }: { state: OperatorState }) {
  const s = state.settings;
  const [key, setKey] = useState('');
  const [model, setModel] = useState(s.model);
  const [baseUrl, setBaseUrl] = useState(s.baseUrl);
  const [models, setModels] = useState<string[]>([]);
  const [listing, setListing] = useState(false);
  const info = PROVIDERS[s.provider];
  useEffect(() => setModel(s.model), [s.model, s.provider]);
  useEffect(() => setBaseUrl(s.baseUrl), [s.baseUrl]);
  useEffect(() => { setModels([]); setKey(''); }, [s.provider]);
  const missing = [
    info.keyRequired && !s.apiKeyConfigured ? 'API key' : '',
    info.needsBaseUrl && !s.baseUrl ? 'URL del servidor' : '',
    !s.model ? 'modelo' : '',
  ].filter(Boolean);
  async function listar(): Promise<void> {
    setListing(true);
    const r = await call('import:listModels');
    setListing(false);
    if (r) { setModels(r.models); toast(r.models.length ? 'ok' : 'info', r.models.length ? `${r.models.length} modelo(s) encontrados` : 'El proveedor no devolvió modelos'); }
  }
  let enc = s.encryptionAvailable ? 'Cifrado del sistema disponible.' : 'Este equipo no ofrece cifrado seguro: no se puede guardar la API key.';
  if (s.encryptionBackend === 'basic_text') enc += ' Atención: no hay llavero del sistema (backend basic_text); el cifrado es débil.';
  return (
    <div className="page-2col">
      <section className="panel form">
        <h2>Importación con IA (único módulo con internet)</h2>
        <label>Proveedor de IA
          <select value={s.provider} onChange={(e) => void call('settings:update', { provider: e.target.value as ProviderId })}>
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>{PROVIDERS[id].label}{s.providers[id].apiKeyConfigured ? ' ✓' : ''}</option>
            ))}
          </select>
        </label>
        <small className="muted">{info.help}</small>
        <p>{s.aiReady ? `✓ ${info.label} listo para leer cartones.` : `${info.label}: falta configuración (${missing.join(', ')}). Mientras tanto, solo ingreso manual.`}</p>
        <p className="muted small">{enc}</p>

        {info.needsBaseUrl && (
          <label>URL del servidor (compatible con OpenAI)
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1"
              onBlur={() => baseUrl !== s.baseUrl && void call('settings:update', { baseUrl })} spellCheck={false} />
          </label>
        )}

        <label>API key de {info.label}{info.keyRequired ? '' : ' (opcional)'}
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={info.keyPlaceholder} autoComplete="off" spellCheck={false} />
        </label>
        <div className="row left">
          <span className="muted small">{s.apiKeyConfigured ? '✓ Clave guardada (cifrada)' : 'Sin clave guardada'}</span>
          <button className="primary" disabled={!key.trim()} onClick={async () => { if (await call('settings:setApiKey', key)) toast('ok', 'API key guardada cifrada'); setKey(''); }}>Guardar cifrada</button>
          <button className="danger" disabled={!s.apiKeyConfigured} onClick={() => void call('settings:clearApiKey')}>Borrar API key</button>
        </div>

        <label>Modelo
          <div className="row left" style={{ marginTop: 0 }}>
            <input list="modelos" value={model} onChange={(e) => setModel(e.target.value)} style={{ flex: 1 }}
              onBlur={() => model !== s.model && void call('settings:update', { model })} spellCheck={false}
              placeholder={info.defaultModel || 'Use "Listar modelos" o escriba el identificador'} />
            <button onClick={() => void listar()} disabled={listing}>{listing ? 'Consultando…' : 'Listar modelos'}</button>
          </div>
        </label>
        <datalist id="modelos">{models.map((m) => <option key={m} value={m} />)}</datalist>
        {models.length > 0 && (
          <select aria-label="Modelos disponibles" value="" onChange={(e) => { if (e.target.value) { setModel(e.target.value); void call('settings:update', { model: e.target.value }); } }}>
            <option value="">{models.length} modelo(s) disponibles: elija uno…</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <small className="muted">Debe ser un modelo que acepte imágenes. "Listar modelos" consulta al proveedor con su clave; verifique en la documentación del proveedor cuál conviene para leer imágenes.</small>

        <p className="muted small">
          Aviso de privacidad de {info.label}: {s.aiConsent ? 'aceptado' : 'pendiente (se pide antes de la primera lectura)'}.{' '}
          {s.aiConsent && <button className="link" onClick={() => void call('settings:update', { aiConsent: false })}>Retirar consentimiento</button>}{' '}
          <button className="link" onClick={() => void call('help:openPrivacy')}>Ver política de privacidad</button>
        </p>
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
        <h2>Datos y respaldo</h2>
        <p className="muted small">Base de datos: {state.dataPath}. Se guarda automáticamente tras cada acción.</p>
        <p className="muted small">Haga un respaldo antes de desinstalar o cambiar de equipo: si la app se instaló desde Microsoft Store, Windows borra sus datos al desinstalarla. El respaldo incluye eventos, cartones, juegos, ganadores y figuras (no las fotos de cartones importados).</p>
        <div className="row left">
          <button className="primary" onClick={async () => { const r = await call('data:backup'); if (r) toast('ok', 'Respaldo guardado: ' + r.path); }}>Respaldar base de datos…</button>
          <button onClick={async () => { const r = await call('data:restore'); if (r) toast('ok', `Respaldo restaurado: ${r.events} evento(s), ${r.cards} cartón(es)`); }}>Restaurar respaldo…</button>
        </div>
      </section>
    </div>
  );
}
