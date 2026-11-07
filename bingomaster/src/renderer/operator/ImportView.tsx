/**
 * Importación de cartones externos con IA de visión.
 * Captura (webcam, archivo, carpeta compartida) → lectura en el proceso main
 * → revisión obligatoria lado a lado → guardado como "externo".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FolderFile, OperatorState } from '../../shared/ipc/contract';
import type { ReviewedCard } from '../../shared/import-ai/reading';
import { call, toast } from '../ui/api';
import { CardEditor, draftFrom, draftGrid, draftIsValid, type CardDraft } from '../ui/CardEditor';
import type { Tab } from './OperatorApp';

const MAX_SIDE = 2000;
interface Img { dataUrl: string; base64: string; mediaType: string }

function toJpeg(src: CanvasImageSource, w: number, h: number): Img {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * k);
  cv.height = Math.round(h * k);
  (cv.getContext('2d') as CanvasRenderingContext2D).drawImage(src, 0, 0, cv.width, cv.height);
  const dataUrl = cv.toDataURL('image/jpeg', 0.9);
  return { dataUrl, base64: dataUrl.split(',')[1] as string, mediaType: 'image/jpeg' };
}

function fromUrl(url: string): Promise<Img> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(toJpeg(im, im.naturalWidth, im.naturalHeight));
    im.onerror = () => rej(new Error('No se pudo abrir la imagen'));
    im.src = url;
  });
}

function readFile(f: File): Promise<string> {
  return new Promise((res, rej) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { rej(new Error('Formato no soportado: use JPG, PNG o WEBP')); return; }
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(f);
  });
}

interface Item {
  draft: CardDraft;
  doubtful: string[];
  seriesDoubtful: boolean;
  folioDoubtful: boolean;
  reasons: string[];
  isDoubtful: boolean;
  reviewed: boolean;
  status: 'pending' | 'saved' | 'discarded';
  error: string | null;
}

export function ImportView({ state, goTo }: { state: OperatorState; goTo: (t: Tab) => void }) {
  const [review, setReview] = useState<{ img: Img; key: string | null; items: Item[]; method: 'ia' | 'manual'; double: boolean } | null>(null);
  const [expected, setExpected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ img: Img; key: string | null; error: string } | null>(null);

  const start = useCallback(async (img: Img, key: string | null) => {
    setFailed(null);
    const n = expected ?? 1;
    if (!state.settings.apiKeyConfigured) {
      setReview({ img, key, method: 'manual', double: false, items: Array.from({ length: n }, () => emptyItem()) });
      toast('info', 'Sin API key: transcriba los cartones mirando la foto.');
      return;
    }
    setBusy(state.settings.doubleRead ? 'Leyendo con IA (doble lectura)…' : 'Leyendo con IA…');
    const r = await window.bingo.invoke('import:read', { base64: img.base64, mediaType: img.mediaType, expected });
    setBusy(null);
    if (!r.ok) { setFailed({ img, key, error: r.error }); return; }
    r.warnings.forEach((w) => toast('error', w));
    setReview({ img, key, method: 'ia', double: r.doubleRead, items: r.cards.map(fromReading) });
  }, [expected, state.settings.apiKeyConfigured, state.settings.doubleRead]);

  if (review) {
    return <Review review={review} setReview={setReview} onDone={(saved) => {
      setReview(null);
      toast('ok', `Revisión terminada: ${saved} cartón(es) guardado(s)`);
      if (review.key && saved > 0) void call('import:markImported', review.key);
    }} />;
  }

  return (
    <div className="import">
      {!state.settings.apiKeyConfigured && (
        <div className="feedback info">
          La lectura con IA no está disponible (sin API key). Puede transcribir mirando la foto,
          usar el <button className="link" onClick={() => goTo('cartones')}>ingreso manual</button> o
          configurar la clave en <button className="link" onClick={() => goTo('ajustes')}>Ajustes</button>.
        </div>
      )}
      <div className="import-grid">
        <section className="panel">
          <h2>Guía de captura</h2>
          <ul className="guide">
            <li>Cartón <b>plano</b> sobre la mesa, sin dobleces.</li>
            <li><b>Buena luz</b> pareja; sin sombras de la mano o el celular.</li>
            <li><b>Sin reflejos</b>: incline un poco si el cartón es brillante.</li>
            <li><b>Encuadre completo</b>: 4 bordes, serie y folio visibles.</li>
            <li>Hasta <b>4 cartones</b> por foto, sin taparse entre sí.</li>
            <li>Cámara de frente, no en ángulo.</li>
          </ul>
          <label>Cartones en la foto
            <select value={expected ?? ''} onChange={(e) => setExpected(e.target.value ? Number(e.target.value) : null)}>
              <option value="">No sé (1 a 4)</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
            </select>
          </label>
        </section>
        <Webcam onShot={(img) => void start(img, null)} disabled={!!busy} />
        <section className="panel">
          <h2>Imagen</h2>
          <DropZone onImage={(img) => void start(img, null)} disabled={!!busy} />
          <SharedFolder state={state} onImage={(img, key) => void start(img, key)} disabled={!!busy} />
        </section>
      </div>
      {busy && <div className="feedback info big">⏳ {busy}</div>}
      {failed && (
        <div className="feedback error">
          {failed.error}{' '}
          <button onClick={() => setReview({ img: failed.img, key: failed.key, method: 'manual', double: false, items: Array.from({ length: expected ?? 1 }, () => emptyItem()) })}>
            Transcribir a mano con la foto al lado
          </button>
        </div>
      )}
    </div>
  );
}

function emptyItem(): Item {
  return { draft: draftFrom('', '', null), doubtful: [], seriesDoubtful: false, folioDoubtful: false, reasons: [], isDoubtful: false, reviewed: false, status: 'pending', error: null };
}

function fromReading(c: ReviewedCard): Item {
  return {
    draft: draftFrom(c.series, c.folio, c.grid), doubtful: c.doubtful, seriesDoubtful: c.seriesDoubtful, folioDoubtful: c.folioDoubtful,
    reasons: c.reasons, isDoubtful: c.doubtfulCard, reviewed: false, status: 'pending', error: null,
  };
}

function Review({ review, setReview, onDone }: {
  review: { img: Img; key: string | null; items: Item[]; method: 'ia' | 'manual'; double: boolean };
  setReview: (r: typeof review) => void;
  onDone: (saved: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const update = (i: number, patch: Partial<Item>): void => {
    const items = review.items.map((x, j) => (j === i ? { ...x, ...patch } : x));
    setReview({ ...review, items });
    if (items.every((x) => x.status !== 'pending')) onDone(items.filter((x) => x.status === 'saved').length);
  };

  async function save(i: number): Promise<void> {
    const it = review.items[i] as Item;
    const exists = await call('cards:exists', it.draft.series, it.draft.folio);
    if (exists) { update(i, { error: `Ya existe en el evento un cartón con serie "${exists.series}" y folio "${exists.folio}". Corrija la serie o el folio, o descarte este cartón.` }); return; }
    const r = await call('cards:addExternal', {
      series: it.draft.series, folio: it.draft.folio, grid: draftGrid(it.draft), confirmed: true,
      image: { base64: review.img.base64, mediaType: review.img.mediaType },
    });
    if (r) { toast('ok', `Guardado: ${r.card.series} ${r.card.folio}`); update(i, { status: 'saved', error: null }); }
  }

  return (
    <div className="review">
      <section className="panel photo">
        <div className="row left">
          <b>Foto original</b>
          <button onClick={() => setZoom(Math.max(0.5, zoom / 1.25))} aria-label="Alejar">−</button>
          <button onClick={() => setZoom(Math.min(4, zoom * 1.25))} aria-label="Acercar">+</button>
          <button className="danger" onClick={() => onDone(review.items.filter((x) => x.status === 'saved').length)}>Terminar / descartar pendientes</button>
        </div>
        <div className="photo-scroll"><img src={review.img.dataUrl} alt="Foto de los cartones" style={{ width: `${zoom * 100}%` }} /></div>
      </section>
      <section className="panel readings">
        <p className="muted small">
          Revise celda por celda. <span className="sw doubtful">amarillo</span> = dudosa, <span className="sw invalid">rojo</span> = inválida.
          Nada se guarda sin su confirmación.{review.double ? ' Doble lectura: las diferencias están en amarillo.' : ''}
        </p>
        {review.items.map((it, i) => (
          <div key={i} className={'reading' + (it.isDoubtful ? ' doubtful-card' : '') + (it.status !== 'pending' ? ' ' + it.status : '')}>
            <h3>
              Cartón {i + 1} de {review.items.length}
              {review.method === 'ia' ? (it.isDoubtful ? ' — DUDOSO' : ' — sin observaciones') : ' — transcripción manual'}
              {it.status === 'saved' && ' — GUARDADO'}{it.status === 'discarded' && ' — descartado'}
            </h3>
            {it.reasons.length > 0 && <ul className="reasons">{it.reasons.map((r, k) => <li key={k}>{r}</li>)}</ul>}
            <CardEditor value={it.draft} onChange={(d) => update(i, { draft: d, error: null })} doubtful={it.doubtful}
              seriesDoubtful={it.seriesDoubtful} folioDoubtful={it.folioDoubtful} disabled={it.status !== 'pending'} />
            <label className="chk">
              <input type="checkbox" checked={it.reviewed} disabled={it.status !== 'pending'} onChange={(e) => update(i, { reviewed: e.target.checked })} />
              Comparé este cartón con la foto, celda por celda
            </label>
            {it.error && <div className="feedback error">{it.error}</div>}
            {it.status === 'pending' && (
              <div className="row left">
                <button className="primary" disabled={!it.reviewed || !draftIsValid(it.draft)} onClick={() => void save(i)}>Confirmar y guardar</button>
                <button onClick={() => update(i, { status: 'discarded' })}>Descartar este cartón</button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function Webcam({ onShot, disabled }: { onShot: (img: Img) => void; disabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [cam, setCam] = useState('');
  const stop = useCallback(() => { stream?.getTracks().forEach((t) => t.stop()); setStream(null); }, [stream]);
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  async function on(): Promise<void> {
    stop();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, ...(cam ? { deviceId: { exact: cam } } : {}) }, audio: false });
      setStream(s);
      if (video.current) video.current.srcObject = s;
      setCams((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
    } catch (e) { toast('error', 'No se pudo abrir la cámara: ' + (e as Error).message); }
  }

  return (
    <section className="panel">
      <h2>Webcam</h2>
      <div className="cam"><video ref={video} autoPlay playsInline muted /><div className="frame" /></div>
      <div className="row left">
        {cams.length > 1 && (
          <select value={cam} onChange={(e) => setCam(e.target.value)} aria-label="Cámara">
            {cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Cámara ${i + 1}`}</option>)}
          </select>
        )}
        {stream ? <button onClick={stop}>Apagar cámara</button> : <button onClick={() => void on()}>Encender cámara</button>}
        <button className="primary" disabled={!stream || disabled} onClick={() => {
          const v = video.current;
          if (!v?.videoWidth) return;
          const img = toJpeg(v, v.videoWidth, v.videoHeight);
          stop();
          onShot(img);
        }}>Tomar foto</button>
      </div>
    </section>
  );
}

function DropZone({ onImage, disabled }: { onImage: (img: Img) => void; disabled: boolean }) {
  const [over, setOver] = useState(false);
  async function handle(f: File | undefined): Promise<void> {
    if (!f) return;
    try { onImage(await fromUrl(await readFile(f))); } catch (e) { toast('error', (e as Error).message); }
  }
  return (
    <div className={'drop' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) void handle(e.dataTransfer.files[0]); }}>
      Arrastre una imagen aquí<br />o{' '}
      <label className="link">elija un archivo<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={disabled}
        onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <small>JPG, PNG o WEBP</small>
    </div>
  );
}

function SharedFolder({ state, onImage, disabled }: { state: OperatorState; onImage: (img: Img, key: string) => void; disabled: boolean }) {
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [hide, setHide] = useState(true);
  const load = useCallback(async () => {
    const r = await call('import:listFolder');
    if (r) setFiles(r.files);
  }, []);
  useEffect(() => { void load(); return window.bingo.onFolderChanged(() => void load()); }, [load, state.settings.importFolder]);
  const shown = files.filter((f) => !(hide && f.imported)).slice(0, 50);
  return (
    <div className="shared">
      <h3>Carpeta compartida</h3>
      <div className="muted small">{state.settings.importFolder || 'Sin carpeta (elíjala en Ajustes)'}</div>
      {state.settings.importFolder && (
        <>
          <div className="row left">
            <button onClick={() => void load()}>Actualizar</button>
            <label className="chk"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Ocultar ya importadas</label>
          </div>
          <ul className="files">
            {shown.map((f) => (
              <li key={f.key}>
                <span>{f.name}{f.imported ? ' ✓' : ''}</span>
                <button disabled={disabled} onClick={async () => {
                  const r = await call('import:readFolderFile', f.name);
                  if (!r) return;
                  try { onImage(await fromUrl(`data:${r.mediaType};base64,${r.base64}`), r.key); } catch (e) { toast('error', (e as Error).message); }
                }}>Usar</button>
              </li>
            ))}
            {shown.length === 0 && <li className="muted">No hay imágenes pendientes</li>}
          </ul>
        </>
      )}
    </div>
  );
}
